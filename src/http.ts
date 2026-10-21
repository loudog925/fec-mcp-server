#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createFecServer } from "./server.js";
import { log, withLogContext } from "./logger.js";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
const authToken = process.env.MCP_AUTH_TOKEN?.trim();
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
  setHeader(name: string, value: string): this;
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

function isAuthorized(req: HttpRequest, res: HttpResponse): boolean {
  if (!authToken) return true;

  const authorization = req.headers.authorization;
  const suppliedToken =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
  const expected = Buffer.from(authToken);
  const supplied = Buffer.from(suppliedToken);
  const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!valid) {
    log("warn", "auth_rejected", {
      reason: suppliedToken ? "bad_token" : "missing_token",
      user_agent: req.headers["user-agent"],
    });
    res.setHeader("WWW-Authenticate", 'Bearer realm="fec-mcp-server"');
    res.status(401).send("Unauthorized");
  }
  return valid;
}

const app = createMcpExpressApp({
  host,
  ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
});

app.get("/healthz", (_req: HttpRequest, res: HttpResponse) => {
  res.json({ status: "ok", server: "fec-mcp-server" });
});

// Summarize the JSON-RPC payload for logging: method names, and the tool name
// for tools/call. Never logs arguments here; tool_call lines handle that.
function describeRpc(body: unknown): { rpc_method?: string; tool?: string; client?: string } {
  const messages = Array.isArray(body) ? body : [body];
  const methods: string[] = [];
  let tool: string | undefined;
  let client: string | undefined;
  for (const message of messages) {
    const m = message as { method?: unknown; params?: Record<string, unknown> } | null;
    if (typeof m?.method !== "string") continue;
    methods.push(m.method);
    if (m.method === "tools/call" && typeof m.params?.name === "string") tool = m.params.name;
    const info = m.params?.clientInfo as { name?: unknown; version?: unknown } | undefined;
    if (m.method === "initialize" && typeof info?.name === "string") {
      client = `${info.name}${typeof info.version === "string" ? `/${info.version}` : ""}`;
    }
  }
  return {
    ...(methods.length ? { rpc_method: methods.join(",") } : {}),
    ...(tool ? { tool } : {}),
    ...(client ? { client } : {}),
  };
}

app.post("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  // Render stamps each request with Rndr-Id; reusing it lets these lines be
  // matched against Render's own HTTP request logs.
  const requestId =
    (req.headers["rndr-id"] as string | undefined) ??
    (req.headers["x-request-id"] as string | undefined) ??
    randomUUID();
  const startedAt = Date.now();
  const rpc = describeRpc(req.body);

  res.on("finish", () => {
    log(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http_request", {
      request_id: requestId,
      ...rpc,
      status: res.statusCode,
      ms: Date.now() - startedAt,
      user_agent: req.headers["user-agent"],
    });
  });

  if (!isAuthorized(req, res)) return;

  await withLogContext({ request_id: requestId }, async () => {
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
      log("error", "mcp_request_error", {
        error: String((error as Error)?.stack ?? error),
      });
      sendError(res, 500, "Internal server error");
    }
  });
});

app.get("/mcp", async (_req: HttpRequest, res: HttpResponse) => {
  res.status(405).send("GET is not supported for the stateless MCP endpoint");
});

app.delete("/mcp", async (_req: HttpRequest, res: HttpResponse) => {
  res.status(405).send("DELETE is not supported for the stateless MCP endpoint");
});

const httpServer = app.listen(port, host, () => {
  log("info", "server_started", {
    url: `http://${host}:${port}/mcp`,
    auth: authToken ? "bearer" : "none",
    allowed_hosts: allowedHosts,
    node: process.version,
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7),
  });
});

async function shutdown(): Promise<void> {
  log("info", "server_stopping");
  await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { error: String((reason as Error)?.stack ?? reason) });
});
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
