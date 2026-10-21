import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { fetchFEC } from "../src/fecClient.js";
import { createFecServer } from "../src/server.js";
import { log, withLogContext } from "../src/logger.js";

function captureStderr() {
  const lines: Record<string, unknown>[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    for (const line of String(chunk).split("\n").filter(Boolean)) lines.push(JSON.parse(line));
    return true;
  });
  return { lines, spy };
}

describe("logger", () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
  });
  afterEach(() => {
    process.env.LOG_LEVEL = "silent";
    vi.restoreAllMocks();
  });

  it("writes JSON lines with the active context", () => {
    const { lines } = captureStderr();
    withLogContext({ request_id: "req-1", tool: "fec_x" }, () => log("info", "hello", { a: 1 }));
    expect(lines[0]).toMatchObject({ level: "info", event: "hello", request_id: "req-1", tool: "fec_x", a: 1 });
  });

  it("drops lines below LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const { lines } = captureStderr();
    log("info", "quiet");
    log("warn", "loud");
    expect(lines.map((l) => l.event)).toEqual(["loud"]);
  });
});

describe("fetchFEC logging", () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
    process.env.FEC_API_KEY = "secret-key";
    process.env.FEC_RATE_LIMIT_BASE_MS = "0";
  });
  afterEach(() => {
    process.env.LOG_LEVEL = "silent";
    delete process.env.FEC_API_TIMEOUT_MS;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("logs status, timing, and rate-limit headroom without leaking the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "x-ratelimit-remaining" ? "42" : null) },
        json: async () => ({}),
      })
    );
    const { lines } = captureStderr();
    await fetchFEC("/candidates/search/", { q: "x" });
    expect(lines[0]).toMatchObject({ event: "fec_request", path: "/candidates/search/", status: 200, rate_limit_remaining: 42 });
    expect(JSON.stringify(lines)).not.toContain("secret-key");
  });

  it("reports a timeout distinctly from other network failures", async () => {
    process.env.FEC_API_TIMEOUT_MS = "10";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted")))
        )
      )
    );
    const { lines } = captureStderr();
    await expect(fetchFEC("/schedules/schedule_a/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: expect.stringContaining("did not respond within"),
    });
    expect(lines[0]).toMatchObject({ event: "fec_request_failed", timed_out: true, timeout_ms: 10 });
  });
});

describe("tool call instrumentation", () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
    process.env.FEC_API_KEY = "secret-key";
    process.env.FEC_RATE_LIMIT_RETRIES = "0";
  });
  afterEach(() => {
    process.env.LOG_LEVEL = "silent";
    delete process.env.FEC_RATE_LIMIT_RETRIES;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("logs failed tool calls with the error the model saw and the FEC call count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })
    );
    const server: McpServer = createFecServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientTransport);

    const { lines } = captureStderr();
    const result = await client.callTool({ name: "fec_candidate_search", arguments: { q: "Smith" } });
    expect(result.isError).toBe(true);

    const toolLine = lines.find((l) => l.event === "tool_call");
    expect(toolLine).toMatchObject({
      tool: "fec_candidate_search",
      ok: false,
      fec_calls: 1,
      error: expect.stringContaining("rate limit"),
      args: expect.stringContaining("Smith"),
    });
    expect(lines.find((l) => l.event === "fec_request")).toMatchObject({ tool: "fec_candidate_search", status: 429 });
    await client.close();
  });
});
