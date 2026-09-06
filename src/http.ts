#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createFecServer } from "./server.js";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
const transports = new Map<string, StreamableHTTPServerTransport>();

interface HttpRequest extends IncomingMessage {
  body: unknown;
}

interface HttpResponse extends ServerResponse {
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
  send(body: unknown): HttpResponse;
}

function sendError(res: HttpResponse, status: number, message: string): void {
  if (!res.headersSent) {
    res.status(status).json({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    });
  }
}

const app = createMcpExpressApp();

app.get("/healthz", (_req: HttpRequest, res: HttpResponse) => {
  res.json({ status: "ok", server: "fec-mcp-server" });
});

app.post("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  const requestedSessionId = req.headers["mcp-session-id"];

  try {
    let transport: StreamableHTTPServerTransport | undefined;

    if (typeof requestedSessionId === "string") {
      transport = transports.get(requestedSessionId);
      if (!transport) {
        sendError(res, 404, "Unknown MCP session");
        return;
      }
    } else if (isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          if (transport) transports.set(sessionId, transport);
        },
      });

      transport.onclose = () => {
        const sessionId = transport?.sessionId;
        if (sessionId) transports.delete(sessionId);
      };

      const server = createFecServer();
      await server.connect(transport);
    } else {
      sendError(res, 400, "MCP session ID is required after initialization");
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP POST request:", error);
    sendError(res, 500, "Internal server error");
  }
});

app.get("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing MCP session ID");
    return;
  }

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP GET request:", error);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

app.delete("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing MCP session ID");
    return;
  }

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP DELETE request:", error);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

const httpServer = app.listen(port, host, () => {
  console.log(`FEC MCP Streamable HTTP server listening on http://${host}:${port}/mcp`);
});

async function shutdown(): Promise<void> {
  for (const transport of transports.values()) await transport.close();
  await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
