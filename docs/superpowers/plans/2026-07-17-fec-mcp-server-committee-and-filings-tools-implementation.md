# Committee & Filings Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new MCP tools (`fec_committee_search`, `fec_committee_reports`) and rename/broaden the existing `fec_compliance_flags` tool into `fec_filings`, closing the committee-info and general-filing-info gaps identified against the `C:\GitHub\FEC-API` scripts.

**Architecture:** Same pattern as all 8 existing tools: a pure, directly-testable logic function per tool, plus a thin `registerXTool(server)` wrapper using `@modelcontextprotocol/sdk`'s `server.tool(...)` with a zod parameter schema, delegating to `fetchFEC` from `src/fecClient.ts` (already built, unchanged in this plan).

**Tech Stack:** TypeScript (strict), Node.js 20+, `@modelcontextprotocol/sdk`, `zod`, Vitest (unit tests, mocked `global.fetch`).

## Global Constraints

- Relative imports inside `.ts` files must use explicit `.js` extensions (NodeNext moduleResolution) — e.g. `import { fetchFEC } from "../fecClient.js";`.
- No local caching or database — every tool call hits `https://api.open.fec.gov/v1` live, per request.
- Each tool validates its own required parameters before calling out, returning a helpful message rather than letting a bad request hit the API.
- Errors from `fetchFEC` are already normalized (`FecApiError` with codes `RATE_LIMITED`/`BAD_REQUEST`/`UNAVAILABLE`) — tools don't need to handle this themselves, just let it propagate to the `try/catch` in each tool's `registerXTool` wrapper.
- Testing: Vitest unit tests with `global.fetch` mocked, no network/API key required to run tests or in CI.
- Commit after every task.
- All array-valued FEC ID params (`committee_id`, `candidate_id`) must be uppercased before being passed to `fetchFEC`, matching the existing convention across all 8 shipped tools (e.g. `committee_id?.map((id) => id.toUpperCase())`).

---

### Task 1: Tool — committee search

**Files:**
- Create: `src/tools/committees.ts`
- Test: `tests/committees.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function committeeSearch(params: CommitteeSearchParams): Promise<string>` and `export function registerCommitteeSearchTool(server: McpServer): void`.
- Wraps `GET /committees/`. Confirmed against the real OpenFEC source
  (`webservices/resources/committees.py`, `CommitteeList`): supports `q`
  (fulltext name), `committee_id` (array), `candidate_id` (array, finds a
  candidate's affiliated committees), `state`, `party`, `committee_type`,
  `designation`, `organization_type`, `cycle` (array), `treasurer_name`
  (fulltext).

- [ ] **Step 1: Write the failing test**

Create `tests/committees.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { committeeSearch } from "../src/tools/committees.js";

describe("committeeSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when no search filters are provided", async () => {
    await expect(committeeSearch({})).rejects.toThrow("Provide at least one of");
  });

  it("calls the FEC committees endpoint and returns JSON text", async () => {
    const mockResponse = { results: [{ committee_id: "C00401224", name: "ACTBLUE" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeSearch({ q: "ActBlue", state: "MA" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committees/");
    expect(calledUrl).toContain("q=ActBlue");
    expect(calledUrl).toContain("state=MA");
  });

  it("uppercases committee_id and candidate_id arrays", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await committeeSearch({ committee_id: ["c00401224"], candidate_id: ["h8ca01234"] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("candidate_id=H8CA01234");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/committees.test.ts`
Expected: FAIL — `src/tools/committees.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/committees.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CommitteeSearchParams {
  q?: string;
  committee_id?: string[];
  candidate_id?: string[];
  state?: string;
  party?: string;
  committee_type?: string;
  designation?: string;
  organization_type?: string;
  cycle?: number[];
  treasurer_name?: string;
  per_page?: number;
}

export async function committeeSearch(params: CommitteeSearchParams): Promise<string> {
  const { q, committee_id, candidate_id, state, party } = params;
  const hasCommitteeId = committee_id && committee_id.length > 0;
  const hasCandidateId = candidate_id && candidate_id.length > 0;
  if (!q && !hasCommitteeId && !hasCandidateId && !state && !party) {
    throw new Error(
      "Provide at least one of: q (committee name), committee_id, candidate_id, state, or party to search committees."
    );
  }
  const data = await fetchFEC("/committees/", {
    q,
    committee_id: committee_id?.map((id) => id.toUpperCase()),
    candidate_id: candidate_id?.map((id) => id.toUpperCase()),
    state,
    party,
    committee_type: params.committee_type,
    designation: params.designation,
    organization_type: params.organization_type,
    cycle: params.cycle,
    treasurer_name: params.treasurer_name,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCommitteeSearchTool(server: McpServer): void {
  server.tool(
    "fec_committee_search",
    "Search FEC committees by name, ID, affiliated candidate, state, party, type, or designation. Also serves as a single-committee lookup by passing committee_id directly.",
    {
      q: z.string().optional().describe("Committee name search text"),
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00401224\"]"),
      candidate_id: z.array(z.string()).optional().describe("Find committees affiliated with these FEC candidate IDs"),
      state: z.string().length(2).optional().describe("Two-letter state code"),
      party: z.string().optional().describe("Party code, e.g. DEM, REP"),
      committee_type: z.string().optional().describe("FEC committee type code"),
      designation: z.string().optional().describe("FEC designation code"),
      organization_type: z.string().optional().describe("FEC organization type code"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      treasurer_name: z.string().optional().describe("Treasurer name search text"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await committeeSearch(params);
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

Run: `npx vitest run tests/committees.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import after the existing tool imports (before the `try { getApiKey(); }` block):

```ts
import { registerCommitteeSearchTool } from "./tools/committees.js";
```

Add the registration call alongside the existing ones (after `registerComplianceFlagsTool(server);`):

```ts
registerCommitteeSearchTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/committees.ts tests/committees.test.ts src/index.ts
git commit -m "Add fec_committee_search tool"
```

---

### Task 2: Tool — committee reports

**Files:**
- Create: `src/tools/committeeReports.ts`
- Test: `tests/committeeReports.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function committeeReports(params: CommitteeReportsParams): Promise<string>` and `export function registerCommitteeReportsTool(server: McpServer): void`.
- Wraps `GET /committee/{committee_id}/reports/`. Confirmed against the real
  OpenFEC source (`webservices/resources/reports.py`, `CommitteeReportsView`):
  period-by-period financial reports (cash on hand, receipts, disbursements,
  debts), distinct from `fec_financial_summary`'s cycle-level totals.
- **Default behavior:** when `is_amended` is not provided, pass `most_recent: true`
  so results reflect only the current version of each report. When
  `is_amended` is explicitly provided (true or false), omit `most_recent`
  entirely so the caller sees amendment history as requested.

- [ ] **Step 1: Write the failing test**

Create `tests/committeeReports.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { committeeReports } from "../src/tools/committeeReports.js";

describe("committeeReports", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(committeeReports({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("defaults to most_recent=true when is_amended is not provided", async () => {
    const mockResponse = { results: [{ cash_on_hand_end_period: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeReports({ committee_id: "c00401224" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00401224/reports/");
    expect(calledUrl).toContain("most_recent=true");
  });

  it("omits most_recent when is_amended is explicitly provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await committeeReports({ committee_id: "C00401224", is_amended: true });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("is_amended=true");
    expect(calledUrl).not.toContain("most_recent=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/committeeReports.test.ts`
Expected: FAIL — `src/tools/committeeReports.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/committeeReports.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CommitteeReportsParams {
  committee_id: string;
  cycle?: number[];
  year?: number[];
  is_amended?: boolean;
  min_receipt_date?: string;
  max_receipt_date?: string;
  min_receipts_amount?: number;
  max_receipts_amount?: number;
  min_disbursements_amount?: number;
  max_disbursements_amount?: number;
  min_cash_on_hand_end_period_amount?: number;
  max_cash_on_hand_end_period_amount?: number;
  min_debts_owed_amount?: number;
  max_debts_owed_amount?: number;
  per_page?: number;
}

export async function committeeReports(params: CommitteeReportsParams): Promise<string> {
  const { committee_id, is_amended } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC(
    `/committee/${encodeURIComponent(committee_id.toUpperCase())}/reports/`,
    {
      cycle: params.cycle,
      year: params.year,
      is_amended,
      most_recent: is_amended === undefined ? true : undefined,
      min_receipt_date: params.min_receipt_date,
      max_receipt_date: params.max_receipt_date,
      min_receipts_amount: params.min_receipts_amount,
      max_receipts_amount: params.max_receipts_amount,
      min_disbursements_amount: params.min_disbursements_amount,
      max_disbursements_amount: params.max_disbursements_amount,
      min_cash_on_hand_end_period_amount: params.min_cash_on_hand_end_period_amount,
      max_cash_on_hand_end_period_amount: params.max_cash_on_hand_end_period_amount,
      min_debts_owed_amount: params.min_debts_owed_amount,
      max_debts_owed_amount: params.max_debts_owed_amount,
      per_page: params.per_page ?? 20,
    }
  );
  return JSON.stringify(data, null, 2);
}

export function registerCommitteeReportsTool(server: McpServer): void {
  server.tool(
    "fec_committee_reports",
    "Get a committee's period-by-period financial reports: cash on hand, receipts, disbursements, and debts per reporting period. Defaults to only the current version of each report unless is_amended is set.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      year: z.array(z.number()).optional().describe("Calendar years"),
      is_amended: z
        .boolean()
        .optional()
        .describe("Filter to only amended (true) or only original (false) reports; omit to see only the current version of each"),
      min_receipt_date: z.string().optional().describe("YYYY-MM-DD"),
      max_receipt_date: z.string().optional().describe("YYYY-MM-DD"),
      min_receipts_amount: z.number().optional(),
      max_receipts_amount: z.number().optional(),
      min_disbursements_amount: z.number().optional(),
      max_disbursements_amount: z.number().optional(),
      min_cash_on_hand_end_period_amount: z.number().optional(),
      max_cash_on_hand_end_period_amount: z.number().optional(),
      min_debts_owed_amount: z.number().optional(),
      max_debts_owed_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await committeeReports(params);
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

Run: `npx vitest run tests/committeeReports.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import alongside the Task 1 import:

```ts
import { registerCommitteeReportsTool } from "./tools/committeeReports.js";
```

Add the registration call alongside the existing ones:

```ts
registerCommitteeReportsTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/committeeReports.ts tests/committeeReports.test.ts src/index.ts
git commit -m "Add fec_committee_reports tool"
```

---

### Task 3: Rename and broaden `fec_compliance_flags` into `fec_filings`

**Files:**
- Create: `src/tools/filings.ts` (replaces `src/tools/compliance.ts`)
- Create: `tests/filings.test.ts` (replaces `tests/compliance.test.ts`)
- Delete: `src/tools/compliance.ts`
- Delete: `tests/compliance.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function filings(params: FilingsParams): Promise<string>` and `export function registerFilingsTool(server: McpServer): void`. These replace the removed `complianceFlags`/`registerComplianceFlagsTool` exports — no other file references those names (only `src/index.ts` imports from this file).
- No behavior change from the currently-shipped `fec_compliance_flags` beyond
  the rename and a broader description — the underlying endpoint call,
  validation rules (exactly one of `candidate_id`/`committee_id`), and
  `form_type` default (`["RFAI"]`, already fixed from the earlier
  `request_type` bug) are unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/filings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { filings } from "../src/tools/filings.js";

describe("filings", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither candidate_id nor committee_id is provided", async () => {
    await expect(filings({})).rejects.toThrow(
      "Provide exactly one of candidate_id or committee_id"
    );
  });

  it("throws when both candidate_id and committee_id are provided", async () => {
    await expect(
      filings({ candidate_id: "H8CA01234", committee_id: "C00358796" })
    ).rejects.toThrow("Provide only one of candidate_id or committee_id");
  });

  it("calls the candidate filings endpoint with a default RFAI form_type filter", async () => {
    const mockResponse = { results: [{ form_type: "RFAI", file_number: 123456 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await filings({ candidate_id: "h8ca01234" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/H8CA01234/filings/");
    expect(calledUrl).toContain("form_type=RFAI");
  });

  it("calls the committee filings endpoint when committee_id is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await filings({ committee_id: "c00358796", is_amended: true });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00358796/filings/");
    expect(calledUrl).toContain("is_amended=true");
  });

  it("accepts a non-RFAI form_type for general filing lookups", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await filings({ committee_id: "C00401224", form_type: ["F3X"] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("form_type=F3X");
    expect(calledUrl).not.toContain("form_type=RFAI");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/filings.test.ts`
Expected: FAIL — `src/tools/filings.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/filings.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface FilingsParams {
  candidate_id?: string;
  committee_id?: string;
  form_type?: string[];
  is_amended?: boolean;
  per_page?: number;
}

export async function filings(params: FilingsParams): Promise<string> {
  const { candidate_id, committee_id, form_type, is_amended, per_page } = params;
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
    form_type: form_type ?? ["RFAI"],
    is_amended,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerFilingsTool(server: McpServer): void {
  server.tool(
    "fec_filings",
    "Get a candidate's or committee's filings, optionally filtered by form type (e.g. \"F3X\" for quarterly reports; defaults to [\"RFAI\"] for compliance/Request-for-Additional-Information checks) or amendment status.",
    {
      candidate_id: z.string().optional().describe("FEC candidate ID (provide this or committee_id, not both)"),
      committee_id: z.string().optional().describe("FEC committee ID (provide this or candidate_id, not both)"),
      form_type: z
        .array(z.string())
        .optional()
        .describe("Filing form types to filter on, e.g. [\"F3X\"]; defaults to [\"RFAI\"]"),
      is_amended: z.boolean().optional().describe("Filter to only amended (true) or only original (false) filings"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await filings(params);
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

Run: `npx vitest run tests/filings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Delete the old compliance files**

```bash
git rm src/tools/compliance.ts tests/compliance.test.ts
```

(This removes them from disk and stages the deletion in one step.)

- [ ] **Step 6: Update `src/index.ts`**

Replace the compliance import line:

```ts
import { registerComplianceFlagsTool } from "./tools/compliance.js";
```

with:

```ts
import { registerFilingsTool } from "./tools/filings.js";
```

Replace the compliance registration call:

```ts
registerComplianceFlagsTool(server);
```

with:

```ts
registerFilingsTool(server);
```

- [ ] **Step 7: Run the full test suite and build**

Run: `npx vitest run && npm run build`
Expected: build succeeds; all test files pass (fecClient + 10 tool files: candidates, financials, contributions, expenditures, independentExp, donors, spending, committees, committeeReports, filings — 11 test files total, since compliance.test.ts is gone and filings.test.ts replaces it).

- [ ] **Step 8: Commit**

```bash
git add src/tools/filings.ts tests/filings.test.ts src/index.ts
git commit -m "Rename fec_compliance_flags to fec_filings and broaden its description"
```

---

### Task 4: Update README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: an accurate tools table and description reflecting the 10 tools now shipped (8 original + 2 new), with `fec_compliance_flags` renamed to `fec_filings`.

- [ ] **Step 1: Update the tools table in `README.md`**

Find this table:

```markdown
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
```

Replace it with:

```markdown
| Tool | Purpose |
|---|---|
| `fec_candidate_search` | Search federal candidates by name, state, office, party |
| `fec_financial_summary` | A candidate's aggregated financial totals |
| `fec_committee_search` | Search committees by name, ID, affiliated candidate, state, party, type |
| `fec_committee_reports` | A committee's period-by-period financial reports (cash on hand, receipts, disbursements, debts) |
| `fec_itemized_contributions` | Schedule A itemized contributions to a committee |
| `fec_itemized_expenditures` | Schedule B itemized disbursements by a committee |
| `fec_independent_expenditures` | Schedule E independent expenditures for/against a candidate |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_filings` | A candidate's or committee's filings by form type (RFAIs, quarterly reports, etc.) or amendment status |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document fec_committee_search, fec_committee_reports, and the fec_filings rename"
```
