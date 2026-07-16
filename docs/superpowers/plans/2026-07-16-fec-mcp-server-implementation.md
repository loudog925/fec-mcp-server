# FEC MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node.js MCP server exposing 8 tools that query the live OpenFEC REST API (candidate search, financial summary, itemized contributions, itemized expenditures, independent expenditures, donor search, spending search, compliance flags), running locally over stdio transport, source-controlled in a new private GitHub repo.

**Architecture:** A single shared HTTP client (`src/fecClient.ts`) normalizes all calls to `https://api.open.fec.gov/v1`, including auth (`api_key` query param) and error handling (rate limit / bad request / unavailable). Each tool lives in its own file under `src/tools/`, exporting a pure, directly-testable logic function plus a thin `registerXTool(server)` wrapper that wires it into the `@modelcontextprotocol/sdk`'s `McpServer` via `server.tool(...)`. `src/index.ts` is the entrypoint: validates `FEC_API_KEY` is present, constructs the `McpServer`, registers all 8 tools, and connects a `StdioServerTransport`.

**Tech Stack:** TypeScript (strict), Node.js 20+, `@modelcontextprotocol/sdk`, `zod` (tool parameter schemas), `dotenv` (local `.env` loading), Vitest (unit tests, mocked `global.fetch`).

## Global Constraints

- Node.js 20+ target; TypeScript strict mode; ES modules (`"type": "module"` in package.json).
- Relative imports inside `.ts` files must use explicit `.js` extensions (required by `moduleResolution: "NodeNext"`), e.g. `import { fetchFEC } from "../fecClient.js";`.
- No local caching or database of any kind — every tool call hits `https://api.open.fec.gov/v1` live, per request.
- Auth: `FEC_API_KEY` read from `process.env`. `.env` (gitignored) loaded via `dotenv` for local runs; Claude Desktop/Code sets it directly via its config's `env` block when launching the server — both mechanisms coexist without conflict.
- Default API request timeout is 30000ms, overridable via `FEC_API_TIMEOUT_MS`; the donor-search and spending-search tools use a 60000ms default (still overridable by the same env var).
- Errors from the FEC API are normalized: 429 → rate-limit message, 4xx → surfaced API error message, 5xx/network/timeout → generic "unavailable" message. The server must never crash from a bad tool call.
- Testing: Vitest unit tests with `global.fetch` mocked (no network/API key required to run tests or in CI). No automated live e2e suite.
- The GitHub repo is **private**, used purely for source control — no CI/CD, no remote hosting.
- Commit after every task.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts` (placeholder)

**Interfaces:**
- Produces: a buildable, installable Node/TypeScript project. Later tasks add real files under `src/` and `tests/`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fec-mcp-server",
  "version": "0.1.0",
  "description": "MCP server exposing live Federal Election Commission (FEC) data via the OpenFEC API",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "fec-mcp-server": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 4: Create `.env.example`**

```
FEC_API_KEY=your_fec_api_key_here
# Optional: override default request timeout in milliseconds (30000 for most
# tools, 60000 for donor_search / spending_search)
# FEC_API_TIMEOUT_MS=30000
```

- [ ] **Step 5: Create placeholder `src/index.ts`**

```ts
console.error("fec-mcp-server: scaffolding placeholder, not yet implemented");
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes with no errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 7: Verify the project builds**

Run: `npm run build`
Expected: completes with no errors, creates `dist/index.js`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example src/index.ts
git commit -m "Scaffold fec-mcp-server project"
```

---

### Task 2: FEC API client (`fecClient.ts`)

**Files:**
- Create: `src/fecClient.ts`
- Test: `tests/fecClient.test.ts`

**Interfaces:**
- Consumes: nothing (base layer).
- Produces (used by every tool task):
  - `export type FecParams = Record<string, string | number | boolean | (string | number)[] | undefined>;`
  - `export class FecApiError extends Error { code: "RATE_LIMITED" | "BAD_REQUEST" | "UNAVAILABLE"; status?: number; }`
  - `export function getApiKey(): string` — throws `Error` if `FEC_API_KEY` is unset.
  - `export async function fetchFEC<T = unknown>(path: string, params?: FecParams, timeoutMs?: number): Promise<T>`

- [ ] **Step 1: Write the failing tests**

Create `tests/fecClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFEC, getApiKey, FecApiError } from "../src/fecClient.js";

describe("getApiKey", () => {
  it("throws when FEC_API_KEY is not set", () => {
    delete process.env.FEC_API_KEY;
    expect(() => getApiKey()).toThrow("FEC_API_KEY");
  });

  it("returns the key when set", () => {
    process.env.FEC_API_KEY = "abc123";
    expect(getApiKey()).toBe("abc123");
  });
});

describe("fetchFEC", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("builds the URL with base path, params, and api_key, and returns parsed JSON", async () => {
    const mockBody = { results: [{ candidate_id: "H8CA01234" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchFEC("/candidates/search/", { q: "Jane Doe", cycle: [2024, 2026] });

    expect(data).toEqual(mockBody);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("https://api.open.fec.gov/v1/candidates/search/")).toBe(true);
    expect(calledUrl).toContain("api_key=test-key");
    expect(calledUrl).toContain("q=Jane");
    expect(calledUrl).toContain("cycle=2024");
    expect(calledUrl).toContain("cycle=2026");
  });

  it("omits undefined params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFEC("/candidates/search/", { q: "Jane", state: undefined });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("state=");
  });

  it("throws a RATE_LIMITED FecApiError on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("throws a BAD_REQUEST FecApiError with the API's message on HTTP 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Invalid state code" }),
      })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid state code",
    });
  });

  it("throws an UNAVAILABLE FecApiError on HTTP 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("throws an UNAVAILABLE FecApiError when the network request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fecClient.test.ts`
Expected: FAIL — `src/fecClient.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement `src/fecClient.ts`**

```ts
const BASE_URL = "https://api.open.fec.gov/v1";

export type FecParams = Record<
  string,
  string | number | boolean | (string | number)[] | undefined
>;

export class FecApiError extends Error {
  code: "RATE_LIMITED" | "BAD_REQUEST" | "UNAVAILABLE";
  status?: number;

  constructor(message: string, code: FecApiError["code"], status?: number) {
    super(message);
    this.name = "FecApiError";
    this.code = code;
    this.status = status;
  }
}

export function getApiKey(): string {
  const key = process.env.FEC_API_KEY;
  if (!key) {
    throw new Error(
      "FEC_API_KEY environment variable is not set. Add it to a local .env file, " +
        "or set it in your Claude Desktop/Code MCP config's env block."
    );
  }
  return key;
}

function getTimeoutMs(defaultMs: number): number {
  const raw = process.env.FEC_API_TIMEOUT_MS;
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

function buildUrl(path: string, params: FecParams): string {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("api_key", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchFEC<T = unknown>(
  path: string,
  params: FecParams = {},
  timeoutMs = 30000
): Promise<T> {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs(timeoutMs));

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch {
    throw new FecApiError(
      "FEC API unavailable: the request failed or timed out.",
      "UNAVAILABLE"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new FecApiError(
      "FEC API rate limit exceeded. Try again shortly.",
      "RATE_LIMITED",
      429
    );
  }
  if (response.status >= 400 && response.status < 500) {
    const body = await response.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      (body as { message?: string; error?: string }).message ||
      (body as { message?: string; error?: string }).error ||
      `FEC API rejected the request (status ${response.status}).`;
    throw new FecApiError(message, "BAD_REQUEST", response.status);
  }
  if (!response.ok) {
    throw new FecApiError("FEC API unavailable.", "UNAVAILABLE", response.status);
  }

  return (await response.json()) as T;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/fecClient.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fecClient.ts tests/fecClient.test.ts
git commit -m "Add FEC API client with error normalization"
```

---

### Task 3: MCP server entrypoint

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `getApiKey()` from `src/fecClient.ts` (Task 2).
- Produces: a running `McpServer` instance named `server`, connected over stdio, to which Tasks 4–11 each add one tool registration call. No tools are registered yet in this task.

- [ ] **Step 1: Replace the placeholder `src/index.ts`**

```ts
#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getApiKey } from "./fecClient.js";

try {
  getApiKey();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const server = new McpServer({
  name: "fec-mcp-server",
  version: "0.1.0",
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 3: Manually verify fail-fast behavior without an API key**

Run (PowerShell): `Remove-Item Env:\FEC_API_KEY -ErrorAction SilentlyContinue; node dist/index.js`
Expected: prints the "FEC_API_KEY environment variable is not set..." message to stderr and exits immediately (non-zero exit code), does not hang.

- [ ] **Step 4: Manually verify it starts cleanly with an API key**

Run (PowerShell): `$env:FEC_API_KEY = "dummy-key-for-startup-check"; node dist/index.js`
Expected: process starts and hangs waiting on stdio (no error printed, no immediate exit) — this confirms the server is up and listening. Stop it with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "Add MCP server entrypoint with fail-fast API key check"
```

---

### Task 4: Tool — candidate search

**Files:**
- Create: `src/tools/candidates.ts`
- Test: `tests/candidates.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC`, `FecParams` from `src/fecClient.ts`.
- Produces: `export async function candidateSearch(params: CandidateSearchParams): Promise<string>` and `export function registerCandidateSearchTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/candidates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { candidateSearch } from "../src/tools/candidates.js";

describe("candidateSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when no search filters are provided", async () => {
    await expect(candidateSearch({})).rejects.toThrow("Provide at least one of");
  });

  it("calls the FEC candidates search endpoint and returns JSON text", async () => {
    const mockResponse = { results: [{ candidate_id: "H8CA01234", name: "DOE, JANE" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await candidateSearch({ q: "Jane Doe", state: "CA" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidates/search/");
    expect(calledUrl).toContain("q=Jane");
    expect(calledUrl).toContain("state=CA");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/candidates.test.ts`
Expected: FAIL — `src/tools/candidates.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/candidates.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CandidateSearchParams {
  q?: string;
  state?: string;
  party?: string;
  office?: "H" | "S" | "P";
  cycle?: number[];
  per_page?: number;
}

export async function candidateSearch(params: CandidateSearchParams): Promise<string> {
  const { q, state, party, office, cycle, per_page } = params;
  if (!q && !state && !office && !party) {
    throw new Error(
      "Provide at least one of: q (candidate name), state, office, or party to search candidates."
    );
  }
  const data = await fetchFEC("/candidates/search/", {
    q,
    state,
    party,
    office,
    cycle,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCandidateSearchTool(server: McpServer): void {
  server.tool(
    "fec_candidate_search",
    "Search federal (House, Senate, Presidential) candidates by name, state, office, or party.",
    {
      q: z.string().optional().describe("Candidate name search text"),
      state: z.string().length(2).optional().describe("Two-letter state code, e.g. CA"),
      party: z.string().optional().describe("Party code, e.g. DEM, REP"),
      office: z.enum(["H", "S", "P"]).optional().describe("H = House, S = Senate, P = President"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await candidateSearch(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/candidates.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import near the top:

```ts
import { registerCandidateSearchTool } from "./tools/candidates.js";
```

Add before `const transport = new StdioServerTransport();`:

```ts
registerCandidateSearchTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/candidates.ts tests/candidates.test.ts src/index.ts
git commit -m "Add fec_candidate_search tool"
```

---

### Task 5: Tool — financial summary

**Files:**
- Create: `src/tools/financials.ts`
- Test: `tests/financials.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function financialSummary(params: FinancialSummaryParams): Promise<string>` and `export function registerFinancialSummaryTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/financials.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { financialSummary } from "../src/tools/financials.js";

describe("financialSummary", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when candidate_id is missing", async () => {
    await expect(financialSummary({ candidate_id: "" })).rejects.toThrow(
      "candidate_id is required"
    );
  });

  it("calls the candidate totals endpoint with an uppercased candidate_id", async () => {
    const mockResponse = { results: [{ receipts: 100000, disbursements: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await financialSummary({ candidate_id: "h8ca01234", cycle: [2024] });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/H8CA01234/totals/");
    expect(calledUrl).toContain("cycle=2024");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/financials.test.ts`
Expected: FAIL — `src/tools/financials.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/financials.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface FinancialSummaryParams {
  candidate_id: string;
  cycle?: number[];
}

export async function financialSummary(params: FinancialSummaryParams): Promise<string> {
  const { candidate_id, cycle } = params;
  if (!candidate_id || !candidate_id.trim()) {
    throw new Error("candidate_id is required, e.g. H8CA01234");
  }
  const data = await fetchFEC(
    `/candidate/${encodeURIComponent(candidate_id.toUpperCase())}/totals/`,
    { cycle }
  );
  return JSON.stringify(data, null, 2);
}

export function registerFinancialSummaryTool(server: McpServer): void {
  server.tool(
    "fec_financial_summary",
    "Get a candidate's aggregated financial totals: receipts, disbursements, cash on hand, across their principal committees.",
    {
      candidate_id: z.string().min(1).describe("FEC candidate ID, e.g. H8CA01234"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
    },
    async (params) => {
      try {
        const text = await financialSummary(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/financials.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerFinancialSummaryTool } from "./tools/financials.js";
```

Add alongside the previous registration call:

```ts
registerFinancialSummaryTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/financials.ts tests/financials.test.ts src/index.ts
git commit -m "Add fec_financial_summary tool"
```

---

### Task 6: Tool — itemized contributions (Schedule A)

**Files:**
- Create: `src/tools/contributions.ts`
- Test: `tests/contributions.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function itemizedContributions(params: ItemizedContributionsParams): Promise<string>` and `export function registerItemizedContributionsTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/contributions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { itemizedContributions } from "../src/tools/contributions.js";

describe("itemizedContributions", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor contributor_name is provided", async () => {
    await expect(itemizedContributions({})).rejects.toThrow(
      "Provide at least committee_id or contributor_name"
    );
  });

  it("calls the schedule_a endpoint with the given filters", async () => {
    const mockResponse = { results: [{ contributor_name: "SMITH, JOHN", contribution_receipt_amount: 500 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await itemizedContributions({
      committee_id: ["C00358796"],
      min_amount: 200,
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/");
    expect(calledUrl).toContain("committee_id=C00358796");
    expect(calledUrl).toContain("min_amount=200");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/contributions.test.ts`
Expected: FAIL — `src/tools/contributions.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/contributions.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface ItemizedContributionsParams {
  committee_id?: string[];
  contributor_name?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
}

export async function itemizedContributions(
  params: ItemizedContributionsParams
): Promise<string> {
  const { committee_id, contributor_name } = params;
  if ((!committee_id || committee_id.length === 0) && !contributor_name) {
    throw new Error(
      "Provide at least committee_id or contributor_name to search itemized contributions."
    );
  }
  const data = await fetchFEC("/schedules/schedule_a/", {
    committee_id,
    contributor_name,
    contributor_state: params.contributor_state,
    contributor_employer: params.contributor_employer,
    contributor_occupation: params.contributor_occupation,
    min_date: params.min_date,
    max_date: params.max_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerItemizedContributionsTool(server: McpServer): void {
  server.tool(
    "fec_itemized_contributions",
    "Get itemized individual contributions (Schedule A) to a committee, optionally filtered by contributor name/employer/occupation/state/date/amount.",
    {
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00358796\"]"),
      contributor_name: z.string().optional().describe("Contributor name search text"),
      contributor_state: z.string().length(2).optional().describe("Two-letter state code"),
      contributor_employer: z.string().optional(),
      contributor_occupation: z.string().optional(),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await itemizedContributions(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/contributions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerItemizedContributionsTool } from "./tools/contributions.js";
```

Add alongside the previous registration calls:

```ts
registerItemizedContributionsTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/contributions.ts tests/contributions.test.ts src/index.ts
git commit -m "Add fec_itemized_contributions tool"
```

---

### Task 7: Tool — itemized expenditures (Schedule B)

**Files:**
- Create: `src/tools/expenditures.ts`
- Test: `tests/expenditures.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function itemizedExpenditures(params: ItemizedExpendituresParams): Promise<string>` and `export function registerItemizedExpendituresTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/expenditures.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { itemizedExpenditures } from "../src/tools/expenditures.js";

describe("itemizedExpenditures", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor recipient_name is provided", async () => {
    await expect(itemizedExpenditures({})).rejects.toThrow(
      "Provide at least committee_id or recipient_name"
    );
  });

  it("calls the schedule_b endpoint with the given filters", async () => {
    const mockResponse = { results: [{ recipient_name: "ACME MEDIA", disbursement_amount: 5000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await itemizedExpenditures({
      committee_id: ["C00358796"],
      disbursement_description: "media buy",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/");
    expect(calledUrl).toContain("committee_id=C00358796");
    expect(calledUrl).toContain("disbursement_description=media");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/expenditures.test.ts`
Expected: FAIL — `src/tools/expenditures.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/expenditures.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface ItemizedExpendituresParams {
  committee_id?: string[];
  recipient_name?: string;
  recipient_state?: string;
  disbursement_description?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
}

export async function itemizedExpenditures(
  params: ItemizedExpendituresParams
): Promise<string> {
  const { committee_id, recipient_name } = params;
  if ((!committee_id || committee_id.length === 0) && !recipient_name) {
    throw new Error(
      "Provide at least committee_id or recipient_name to search itemized expenditures."
    );
  }
  const data = await fetchFEC("/schedules/schedule_b/", {
    committee_id,
    recipient_name,
    recipient_state: params.recipient_state,
    disbursement_description: params.disbursement_description,
    min_date: params.min_date,
    max_date: params.max_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerItemizedExpendituresTool(server: McpServer): void {
  server.tool(
    "fec_itemized_expenditures",
    "Get itemized disbursements (Schedule B) made by a committee, optionally filtered by recipient name/state/description/date/amount.",
    {
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00358796\"]"),
      recipient_name: z.string().optional().describe("Recipient/vendor name search text"),
      recipient_state: z.string().length(2).optional().describe("Two-letter state code"),
      disbursement_description: z.string().optional().describe("Free-text purpose/description search"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await itemizedExpenditures(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/expenditures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerItemizedExpendituresTool } from "./tools/expenditures.js";
```

Add alongside the previous registration calls:

```ts
registerItemizedExpendituresTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/expenditures.ts tests/expenditures.test.ts src/index.ts
git commit -m "Add fec_itemized_expenditures tool"
```

---

### Task 8: Tool — independent expenditures (Schedule E)

**Files:**
- Create: `src/tools/independentExp.ts`
- Test: `tests/independentExp.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function independentExpenditures(params: IndependentExpendituresParams): Promise<string>` and `export function registerIndependentExpendituresTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/independentExp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { independentExpenditures } from "../src/tools/independentExp.js";

describe("independentExpenditures", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither candidate_id nor committee_id is provided", async () => {
    await expect(independentExpenditures({})).rejects.toThrow(
      "Provide at least candidate_id or committee_id"
    );
  });

  it("calls the schedule_e endpoint with the given filters", async () => {
    const mockResponse = { results: [{ payee_name: "MEDIA BUYS LLC", expenditure_amount: 250000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await independentExpenditures({
      candidate_id: ["S0OH00133"],
      support_oppose_indicator: "O",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_e/");
    expect(calledUrl).toContain("candidate_id=S0OH00133");
    expect(calledUrl).toContain("support_oppose_indicator=O");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/independentExp.test.ts`
Expected: FAIL — `src/tools/independentExp.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/independentExp.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface IndependentExpendituresParams {
  candidate_id?: string[];
  committee_id?: string[];
  support_oppose_indicator?: "S" | "O";
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
}

export async function independentExpenditures(
  params: IndependentExpendituresParams
): Promise<string> {
  const { candidate_id, committee_id } = params;
  if ((!candidate_id || candidate_id.length === 0) && (!committee_id || committee_id.length === 0)) {
    throw new Error(
      "Provide at least candidate_id or committee_id to search independent expenditures."
    );
  }
  const data = await fetchFEC("/schedules/schedule_e/", {
    candidate_id,
    committee_id,
    support_oppose_indicator: params.support_oppose_indicator,
    min_date: params.min_date,
    max_date: params.max_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerIndependentExpendituresTool(server: McpServer): void {
  server.tool(
    "fec_independent_expenditures",
    "Get independent expenditures (Schedule E) — Super PAC and other spending supporting or opposing a candidate.",
    {
      candidate_id: z.array(z.string()).optional().describe("FEC candidate IDs, e.g. [\"S0OH00133\"]"),
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs (the spender)"),
      support_oppose_indicator: z
        .enum(["S", "O"])
        .optional()
        .describe("S = support, O = oppose"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await independentExpenditures(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/independentExp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerIndependentExpendituresTool } from "./tools/independentExp.js";
```

Add alongside the previous registration calls:

```ts
registerIndependentExpendituresTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/independentExp.ts tests/independentExp.test.ts src/index.ts
git commit -m "Add fec_independent_expenditures tool"
```

---

### Task 9: Tool — donor search

**Files:**
- Create: `src/tools/donors.ts`
- Test: `tests/donors.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function donorSearch(params: DonorSearchParams): Promise<string>` and `export function registerDonorSearchTool(server: McpServer): void`.
- This wraps the same `/schedules/schedule_a/` endpoint as Task 6, but is donor-first: `contributor_name` is required and no `committee_id` scoping is needed, so it searches across all committees. Uses the 60000ms search timeout per the spec.

- [ ] **Step 1: Write the failing test**

Create `tests/donors.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { donorSearch } from "../src/tools/donors.js";

describe("donorSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when contributor_name is missing", async () => {
    await expect(donorSearch({ contributor_name: "" })).rejects.toThrow(
      "contributor_name is required"
    );
  });

  it("calls the schedule_a endpoint scoped by contributor fields, across all committees", async () => {
    const mockResponse = { results: [{ contributor_name: "SMITH, JOHN", contributor_employer: "ACME CORP" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await donorSearch({
      contributor_name: "John Smith",
      contributor_employer: "Acme Corp",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/");
    expect(calledUrl).toContain("contributor_name=John");
    expect(calledUrl).toContain("contributor_employer=Acme");
    expect(calledUrl).not.toContain("committee_id=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/donors.test.ts`
Expected: FAIL — `src/tools/donors.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/donors.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

const DONOR_SEARCH_TIMEOUT_MS = 60000;

export interface DonorSearchParams {
  contributor_name: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contributor_state?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
}

export async function donorSearch(params: DonorSearchParams): Promise<string> {
  if (!params.contributor_name || !params.contributor_name.trim()) {
    throw new Error("contributor_name is required to search for a donor.");
  }
  const data = await fetchFEC(
    "/schedules/schedule_a/",
    {
      contributor_name: params.contributor_name,
      contributor_employer: params.contributor_employer,
      contributor_occupation: params.contributor_occupation,
      contributor_state: params.contributor_state,
      min_date: params.min_date,
      max_date: params.max_date,
      min_amount: params.min_amount,
      max_amount: params.max_amount,
      per_page: params.per_page ?? 20,
    },
    DONOR_SEARCH_TIMEOUT_MS
  );
  return JSON.stringify(data, null, 2);
}

export function registerDonorSearchTool(server: McpServer): void {
  server.tool(
    "fec_donor_search",
    "Find an individual donor's contributions by name (optionally narrowed by employer/occupation/state/date/amount) across all committees, not just one.",
    {
      contributor_name: z.string().min(1).describe("Donor name search text (required)"),
      contributor_employer: z.string().optional(),
      contributor_occupation: z.string().optional(),
      contributor_state: z.string().length(2).optional().describe("Two-letter state code"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await donorSearch(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/donors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerDonorSearchTool } from "./tools/donors.js";
```

Add alongside the previous registration calls:

```ts
registerDonorSearchTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/donors.ts tests/donors.test.ts src/index.ts
git commit -m "Add fec_donor_search tool"
```

---

### Task 10: Tool — spending search

**Files:**
- Create: `src/tools/spending.ts`
- Test: `tests/spending.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function spendingSearch(params: SpendingSearchParams): Promise<string>` and `export function registerSpendingSearchTool(server: McpServer): void`.
- This wraps the same `/schedules/schedule_b/` endpoint as Task 7, but is vendor/description-first, searching across all committees. Uses the 60000ms search timeout per the spec.

- [ ] **Step 1: Write the failing test**

Create `tests/spending.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { spendingSearch } from "../src/tools/spending.js";

describe("spendingSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither recipient_name nor disbursement_description is provided", async () => {
    await expect(spendingSearch({})).rejects.toThrow(
      "Provide at least recipient_name or disbursement_description"
    );
  });

  it("calls the schedule_b endpoint scoped by recipient/description, across all committees", async () => {
    const mockResponse = { results: [{ recipient_name: "ACME MEDIA", disbursement_description: "TV ADS" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await spendingSearch({
      recipient_name: "Acme Media",
      disbursement_description: "TV ads",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/");
    expect(calledUrl).toContain("recipient_name=Acme");
    expect(calledUrl).not.toContain("committee_id=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spending.test.ts`
Expected: FAIL — `src/tools/spending.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/spending.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

const SPENDING_SEARCH_TIMEOUT_MS = 60000;

export interface SpendingSearchParams {
  recipient_name?: string;
  disbursement_description?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
}

export async function spendingSearch(params: SpendingSearchParams): Promise<string> {
  if (!params.recipient_name && !params.disbursement_description) {
    throw new Error(
      "Provide at least recipient_name or disbursement_description to search spending."
    );
  }
  const data = await fetchFEC(
    "/schedules/schedule_b/",
    {
      recipient_name: params.recipient_name,
      disbursement_description: params.disbursement_description,
      min_date: params.min_date,
      max_date: params.max_date,
      min_amount: params.min_amount,
      max_amount: params.max_amount,
      per_page: params.per_page ?? 20,
    },
    SPENDING_SEARCH_TIMEOUT_MS
  );
  return JSON.stringify(data, null, 2);
}

export function registerSpendingSearchTool(server: McpServer): void {
  server.tool(
    "fec_spending_search",
    "Find spending by vendor name or expenditure description/purpose across all committees, not just one.",
    {
      recipient_name: z.string().optional().describe("Vendor/recipient name search text"),
      disbursement_description: z.string().optional().describe("Free-text purpose/description search"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await spendingSearch(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spending.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerSpendingSearchTool } from "./tools/spending.js";
```

Add alongside the previous registration calls:

```ts
registerSpendingSearchTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/spending.ts tests/spending.test.ts src/index.ts
git commit -m "Add fec_spending_search tool"
```

---

### Task 11: Tool — compliance flags

**Files:**
- Create: `src/tools/compliance.ts`
- Test: `tests/compliance.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function complianceFlags(params: ComplianceFlagsParams): Promise<string>` and `export function registerComplianceFlagsTool(server: McpServer): void`.
- Uses the real OpenFEC filings endpoints: `/candidate/{candidate_id}/filings/` or `/committee/{committee_id}/filings/`, defaulting `request_type` to `["RFAI"]` (Request for Additional Information) so amendments/RFAIs surface by default; callers can override `request_type` or add `is_amended`.

- [ ] **Step 1: Write the failing test**

Create `tests/compliance.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { complianceFlags } from "../src/tools/compliance.js";

describe("complianceFlags", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither candidate_id nor committee_id is provided", async () => {
    await expect(complianceFlags({})).rejects.toThrow(
      "Provide exactly one of candidate_id or committee_id"
    );
  });

  it("throws when both candidate_id and committee_id are provided", async () => {
    await expect(
      complianceFlags({ candidate_id: "H8CA01234", committee_id: "C00358796" })
    ).rejects.toThrow("Provide only one of candidate_id or committee_id");
  });

  it("calls the candidate filings endpoint with a default RFAI request_type filter", async () => {
    const mockResponse = { results: [{ request_type: "RFAI", file_number: 123456 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await complianceFlags({ candidate_id: "h8ca01234" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/H8CA01234/filings/");
    expect(calledUrl).toContain("request_type=RFAI");
  });

  it("calls the committee filings endpoint when committee_id is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await complianceFlags({ committee_id: "c00358796", is_amended: true });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00358796/filings/");
    expect(calledUrl).toContain("is_amended=true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compliance.test.ts`
Expected: FAIL — `src/tools/compliance.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/compliance.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface ComplianceFlagsParams {
  candidate_id?: string;
  committee_id?: string;
  request_type?: string[];
  is_amended?: boolean;
  per_page?: number;
}

export async function complianceFlags(params: ComplianceFlagsParams): Promise<string> {
  const { candidate_id, committee_id, request_type, is_amended, per_page } = params;
  if (!candidate_id && !committee_id) {
    throw new Error("Provide exactly one of candidate_id or committee_id.");
  }
  if (candidate_id && committee_id) {
    throw new Error("Provide only one of candidate_id or committee_id, not both.");
  }
  const path = candidate_id
    ? `/candidate/${encodeURIComponent(candidate_id.toUpperCase())}/filings/`
    : `/committee/${encodeURIComponent((committee_id as string).toUpperCase())}/filings/`;
  const data = await fetchFEC(path, {
    request_type: request_type ?? ["RFAI"],
    is_amended,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerComplianceFlagsTool(server: McpServer): void {
  server.tool(
    "fec_compliance_flags",
    "Check a candidate's or committee's filings for compliance flags: RFAIs (Requests for Additional Information) by default, or amendments via is_amended.",
    {
      candidate_id: z.string().optional().describe("FEC candidate ID (provide this or committee_id, not both)"),
      committee_id: z.string().optional().describe("FEC committee ID (provide this or candidate_id, not both)"),
      request_type: z
        .array(z.string())
        .optional()
        .describe("Filing request types to filter on, defaults to [\"RFAI\"]"),
      is_amended: z.boolean().optional().describe("Filter to only amended (true) or only original (false) filings"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await complianceFlags(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compliance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import:

```ts
import { registerComplianceFlagsTool } from "./tools/compliance.js";
```

Add alongside the previous registration calls:

```ts
registerComplianceFlagsTool(server);
```

- [ ] **Step 6: Verify the full test suite and build**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all test files pass (fecClient + 8 tool files).

- [ ] **Step 7: Commit**

```bash
git add src/tools/compliance.ts tests/compliance.test.ts src/index.ts
git commit -m "Add fec_compliance_flags tool"
```

---

### Task 12: README and Claude Desktop/Code wiring instructions

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: instructions a future reader (including you) can follow with zero prior context to install, configure, and run the server, plus how to manually smoke-test it.

- [ ] **Step 1: Write `README.md`**

```markdown
# fec-mcp-server

A Model Context Protocol (MCP) server exposing live Federal Election Commission
(FEC) campaign finance data, backed by the [OpenFEC API](https://api.open.fec.gov/developers/).

Runs locally as a stdio MCP server — no database, no caching, every tool call
hits the live API. For bulk/historical FEC data backed by a local database,
see the separate `FECDownload` project.

## Setup

1. Get a free FEC API key: https://api.open.fec.gov/developers/
2. `git clone <this repo's URL>`
3. `cd fec-mcp-server`
4. `npm install`
5. `npm run build`
6. Copy `.env.example` to `.env` and fill in your key:
   ```
   FEC_API_KEY=your_real_key_here
   ```

## Running it standalone (manual smoke test)

```powershell
node dist/index.js
```

The process will hang, waiting on stdio — that's expected; it's ready. Stop
it with Ctrl+C. If `FEC_API_KEY` isn't set (no `.env` and not in the
environment), it prints an error and exits immediately instead.

## Wiring it into Claude Desktop / Claude Code

Add an entry to your MCP config (Claude Desktop's `claude_desktop_config.json`,
or Claude Code's MCP config), pointing at the built entrypoint and supplying
the API key directly:

```json
{
  "mcpServers": {
    "fec": {
      "command": "node",
      "args": ["C:\\GitHub\\fec-mcp-server\\dist\\index.js"],
      "env": {
        "FEC_API_KEY": "your_real_key_here"
      }
    }
  }
}
```

Restart Claude Desktop/Code afterward. When Claude launches the server this
way, the `env` block above is what supplies the key — the local `.env` file
is only used when you run `node dist/index.js` yourself.

## Tools

| Tool | Purpose |
|---|---|
| `fec_candidate_search` | Search federal candidates by name, state, office, party |
| `fec_financial_summary` | A candidate's aggregated financial totals |
| `fec_itemized_contributions` | Schedule A itemized contributions to a committee |
| `fec_itemized_expenditures` | Schedule B itemized disbursements by a committee |
| `fec_independent_expenditures` | Schedule E independent expenditures for/against a candidate |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_compliance_flags` | RFAIs and amendments on a candidate's or committee's filings |

## Testing

```powershell
npm test
```

Runs the Vitest suite with `fetch` mocked — no network access or API key
required. There is no automated live end-to-end suite; after building, do a
manual smoke test through Claude Desktop/Code with a few real questions per
tool (e.g. "search for federal candidates named Smith in California").

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `FEC_API_KEY` | Yes | — | From https://api.open.fec.gov/developers/ |
| `FEC_API_TIMEOUT_MS` | No | 30000 (60000 for `fec_donor_search` / `fec_spending_search`) | Per-request timeout override |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with setup, config, and Claude wiring instructions"
```

---

### Task 13: Create the private GitHub repo and push

**Files:** none (repository/hosting operation only)

**Interfaces:** none — this task publishes the already-committed local repo, it does not change source code.

> **Note for whoever executes this task:** creating a remote repository and pushing code are actions visible outside this machine. Confirm with the user before running these steps if you're executing this plan on their behalf without them present.

- [ ] **Step 1: Confirm no uncommitted changes remain**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If not, stop and commit or resolve first.

- [ ] **Step 2: Create the private GitHub repository**

Run: `gh repo create fec-mcp-server --private --source=. --remote=origin`
Expected: creates a new private repo under the authenticated GitHub account and adds it as the `origin` remote.

- [ ] **Step 3: Push**

Run: `git push -u origin master`
Expected: pushes all commits; `git status` afterward shows the local branch tracking `origin/master` with nothing to push.

- [ ] **Step 4: Verify**

Run: `gh repo view --web`
Expected: opens the new repo in a browser, showing all committed files (`src/`, `tests/`, `README.md`, `docs/`, etc.).
