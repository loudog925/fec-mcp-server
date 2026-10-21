import { AsyncLocalStorage } from "node:async_hooks";

// Structured JSON-lines logging to stderr. stdout is reserved for the MCP
// protocol in stdio mode, and Render captures stderr the same as stdout, so
// stderr is the one stream that is safe for both entry points.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogContext {
  request_id?: string;
  tool?: string;
  fec_calls?: number;
}

const contextStore = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return contextStore.run({ ...contextStore.getStore(), ...context }, fn);
}

export function getLogContext(): LogContext | undefined {
  return contextStore.getStore();
}

// Read on every call rather than once at import, so an entry point can set a
// default after its imports have been hoisted and evaluated.
function minRank(): number {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return raw && raw in LEVEL_RANK ? LEVEL_RANK[raw as Level] : LEVEL_RANK.info;
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (LEVEL_RANK[level] < minRank()) return;
  const context = contextStore.getStore();
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(context?.request_id ? { request_id: context.request_id } : {}),
    ...(context?.tool ? { tool: context.tool } : {}),
    ...fields,
  };
  try {
    process.stderr.write(JSON.stringify(entry) + "\n");
  } catch {
    // Logging must never take down a request.
  }
}

export function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}…(${value.length - max} more chars)` : value;
}
