# Loans & Debts Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new MCP tools (`fec_loans`, `fec_debts`) covering OpenFEC Schedule C (loans) and Schedule D (debts/obligations), bringing `fec-mcp-server` to 12 tools total.

**Architecture:** Same pattern as all 10 existing tools: a pure, directly-testable logic function per tool, plus a thin `registerXTool(server)` wrapper using `@modelcontextprotocol/sdk`'s `server.tool(...)` with a zod parameter schema, delegating to `fetchFEC` from `src/fecClient.ts` (already built, unchanged in this plan).

**Tech Stack:** TypeScript (strict), Node.js 20+, `@modelcontextprotocol/sdk`, `zod`, Vitest (unit tests, mocked `global.fetch`).

## Global Constraints

- Relative imports inside `.ts` files must use explicit `.js` extensions (NodeNext moduleResolution) — e.g. `import { fetchFEC } from "../fecClient.js";`.
- No local caching or database — every tool call hits `https://api.open.fec.gov/v1` live, per request.
- Each tool validates its own required parameters before calling out.
- `committee_id` is required and single-valued for both tools (not an array) — uppercase it before passing to `fetchFEC`, matching `fec_financial_summary`/`fec_committee_reports`'s convention (`committee_id.toUpperCase()`, not `.map(...)`).
- Testing: Vitest unit tests with `global.fetch` mocked, no network/API key required to run tests or in CI.
- Commit after every task.

---

### Task 1: Tool — loans

**Files:**
- Create: `src/tools/loans.ts`
- Test: `tests/loans.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function loans(params: LoansParams): Promise<string>` and `export function registerLoansTool(server: McpServer): void`.
- Wraps `GET /schedules/schedule_c/`. Confirmed against the real OpenFEC
  source (`webservices/resources/sched_c.py`, `ScheduleCView`): supports
  `committee_id`, `candidate_name` (fulltext), `loan_source_name` (fulltext),
  `min_incurred_date`/`max_incurred_date`, `min_amount`/`max_amount` (maps to
  `original_loan_amount` range), `min_payment_to_date`/`max_payment_to_date`.

- [ ] **Step 1: Write the failing test**

Create `tests/loans.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loans } from "../src/tools/loans.js";

describe("loans", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(loans({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("calls the schedule_c endpoint with an uppercased committee_id and filters", async () => {
    const mockResponse = { results: [{ loan_source_name: "BIG BANK", original_loan_amount: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loans({ committee_id: "c00401224", loan_source_name: "Big Bank" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_c/");
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("loan_source_name=Big");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/loans.test.ts`
Expected: FAIL — `src/tools/loans.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/loans.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface LoansParams {
  committee_id: string;
  candidate_name?: string;
  loan_source_name?: string;
  min_incurred_date?: string;
  max_incurred_date?: string;
  min_amount?: number;
  max_amount?: number;
  min_payment_to_date?: string;
  max_payment_to_date?: string;
  per_page?: number;
}

export async function loans(params: LoansParams): Promise<string> {
  const { committee_id } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC("/schedules/schedule_c/", {
    committee_id: committee_id.toUpperCase(),
    candidate_name: params.candidate_name,
    loan_source_name: params.loan_source_name,
    min_incurred_date: params.min_incurred_date,
    max_incurred_date: params.max_incurred_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    min_payment_to_date: params.min_payment_to_date,
    max_payment_to_date: params.max_payment_to_date,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerLoansTool(server: McpServer): void {
  server.tool(
    "fec_loans",
    "Get a committee's loans, endorsements, and loan guarantees (Schedule C): loan source, original amount, incurred/payment dates.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      candidate_name: z.string().optional().describe("Candidate name search text"),
      loan_source_name: z.string().optional().describe("Loan source/lender name search text"),
      min_incurred_date: z.string().optional().describe("YYYY-MM-DD"),
      max_incurred_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional().describe("Minimum original loan amount"),
      max_amount: z.number().optional().describe("Maximum original loan amount"),
      min_payment_to_date: z.string().optional().describe("YYYY-MM-DD"),
      max_payment_to_date: z.string().optional().describe("YYYY-MM-DD"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await loans(params);
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

Run: `npx vitest run tests/loans.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import after the existing tool imports:

```ts
import { registerLoansTool } from "./tools/loans.js";
```

Add the registration call after the existing ones (after `registerCommitteeReportsTool(server);`):

```ts
registerLoansTool(server);
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/loans.ts tests/loans.test.ts src/index.ts
git commit -m "Add fec_loans tool"
```

---

### Task 2: Tool — debts

**Files:**
- Create: `src/tools/debts.ts`
- Test: `tests/debts.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `fetchFEC` from `src/fecClient.ts`.
- Produces: `export async function debts(params: DebtsParams): Promise<string>` and `export function registerDebtsTool(server: McpServer): void`.
- Wraps `GET /schedules/schedule_d/`. Confirmed against the real OpenFEC
  source (`webservices/resources/sched_d.py`, `ScheduleDView`): supports
  `committee_id`, `creditor_debtor_name` (fulltext), `nature_of_debt`,
  `report_year` (array), `min_payment_period`/`max_payment_period`,
  `min_amount_incurred`/`max_amount_incurred`,
  `min_amount_outstanding_beginning`/`max_amount_outstanding_beginning`,
  `min_amount_outstanding_close`/`max_amount_outstanding_close`,
  `min_coverage_start_date`/`max_coverage_start_date`,
  `min_coverage_end_date`/`max_coverage_end_date`.

- [ ] **Step 1: Write the failing test**

Create `tests/debts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { debts } from "../src/tools/debts.js";

describe("debts", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(debts({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("calls the schedule_d endpoint with an uppercased committee_id and filters", async () => {
    const mockResponse = { results: [{ creditor_debtor_name: "OFFICE SUPPLY CO", amount_incurred_period: 2000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await debts({ committee_id: "c00401224", creditor_debtor_name: "Office Supply" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_d/");
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("creditor_debtor_name=Office");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/debts.test.ts`
Expected: FAIL — `src/tools/debts.ts` does not exist yet.

- [ ] **Step 3: Implement `src/tools/debts.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface DebtsParams {
  committee_id: string;
  creditor_debtor_name?: string;
  nature_of_debt?: string;
  report_year?: number[];
  min_payment_period?: string;
  max_payment_period?: string;
  min_amount_incurred?: number;
  max_amount_incurred?: number;
  min_amount_outstanding_beginning?: number;
  max_amount_outstanding_beginning?: number;
  min_amount_outstanding_close?: number;
  max_amount_outstanding_close?: number;
  min_coverage_start_date?: string;
  max_coverage_start_date?: string;
  min_coverage_end_date?: string;
  max_coverage_end_date?: string;
  per_page?: number;
}

export async function debts(params: DebtsParams): Promise<string> {
  const { committee_id } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC("/schedules/schedule_d/", {
    committee_id: committee_id.toUpperCase(),
    creditor_debtor_name: params.creditor_debtor_name,
    nature_of_debt: params.nature_of_debt,
    report_year: params.report_year,
    min_payment_period: params.min_payment_period,
    max_payment_period: params.max_payment_period,
    min_amount_incurred: params.min_amount_incurred,
    max_amount_incurred: params.max_amount_incurred,
    min_amount_outstanding_beginning: params.min_amount_outstanding_beginning,
    max_amount_outstanding_beginning: params.max_amount_outstanding_beginning,
    min_amount_outstanding_close: params.min_amount_outstanding_close,
    max_amount_outstanding_close: params.max_amount_outstanding_close,
    min_coverage_start_date: params.min_coverage_start_date,
    max_coverage_start_date: params.max_coverage_start_date,
    min_coverage_end_date: params.min_coverage_end_date,
    max_coverage_end_date: params.max_coverage_end_date,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerDebtsTool(server: McpServer): void {
  server.tool(
    "fec_debts",
    "Get a committee's debts and obligations (Schedule D): creditor/debtor, nature of debt, amount incurred, outstanding balance beginning/close of period.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      creditor_debtor_name: z.string().optional().describe("Creditor/debtor name search text"),
      nature_of_debt: z.string().optional().describe("Nature of debt description"),
      report_year: z.array(z.number()).optional().describe("Calendar years"),
      min_payment_period: z.string().optional().describe("YYYY-MM-DD"),
      max_payment_period: z.string().optional().describe("YYYY-MM-DD"),
      min_amount_incurred: z.number().optional(),
      max_amount_incurred: z.number().optional(),
      min_amount_outstanding_beginning: z.number().optional(),
      max_amount_outstanding_beginning: z.number().optional(),
      min_amount_outstanding_close: z.number().optional(),
      max_amount_outstanding_close: z.number().optional(),
      min_coverage_start_date: z.string().optional().describe("YYYY-MM-DD"),
      max_coverage_start_date: z.string().optional().describe("YYYY-MM-DD"),
      min_coverage_end_date: z.string().optional().describe("YYYY-MM-DD"),
      max_coverage_end_date: z.string().optional().describe("YYYY-MM-DD"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await debts(params);
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

Run: `npx vitest run tests/debts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the tool in `src/index.ts`**

Add the import alongside the Task 1 import:

```ts
import { registerDebtsTool } from "./tools/debts.js";
```

Add the registration call alongside the existing ones:

```ts
registerDebtsTool(server);
```

- [ ] **Step 6: Run the full test suite and build**

Run: `npx vitest run && npm run build`
Expected: build succeeds; all test files pass (fecClient + 12 tool test files: candidates, financials, contributions, expenditures, independentExp, donors, spending, filings, committees, committeeReports, loans, debts — 13 test files total).

- [ ] **Step 7: Commit**

```bash
git add src/tools/debts.ts tests/debts.test.ts src/index.ts
git commit -m "Add fec_debts tool"
```

---

### Task 3: Update README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: an accurate tools table reflecting all 12 tools now shipped.

- [ ] **Step 1: Update the tools table in `README.md`**

Find the current tools table (10 rows, ending with `fec_filings`) and add
two rows for the new tools. The exact current table is:

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
| `fec_loans` | Schedule C loans, endorsements, and loan guarantees for a committee |
| `fec_debts` | Schedule D debts and obligations for a committee |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_filings` | A candidate's or committee's filings by form type (RFAIs, quarterly reports, etc.) or amendment status |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document fec_loans and fec_debts tools"
```
