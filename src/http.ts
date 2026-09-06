#!/usr/bin/env node
import type { IncomingMessage, ServerResponse } from "node:http";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createFecServer } from "./server.js";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

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

const app = createMcpExpressApp({
  host,
  ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
});

app.get("/healthz", (_req: HttpRequest, res: HttpResponse) => {
  res.json({ status: "ok", server: "fec-mcp-server" });
});

app.post("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  try {
    const server = createFecServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("Error handling MCP POST request:", error);
    sendError(res, 500, "Internal server error");
  }
});

app.get("/mcp", async (_req: HttpRequest, res: HttpResponse) => {
  res.status(405).send("GET is not supported for the stateless MCP endpoint");
});

app.delete("/mcp", async (_req: HttpRequest, res: HttpResponse) => {
  res.status(405).send("DELETE is not supported for the stateless MCP endpoint");
});

const httpServer = app.listen(port, host, () => {
  console.log(`FEC MCP Streamable HTTP server listening on http://${host}:${port}/mcp`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
