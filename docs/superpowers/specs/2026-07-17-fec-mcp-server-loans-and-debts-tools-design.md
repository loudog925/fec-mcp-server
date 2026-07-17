# FEC MCP Server — Loans & Debts Tools — Design

Date: 2026-07-17

## Purpose

Add two more MCP tools to `fec-mcp-server` — `fec_loans` and `fec_debts` —
so committee loans (Schedule C) and debts/obligations (Schedule D) can be
dug into directly, rounding out the server's coverage of committee
financial detail alongside the existing `fec_committee_reports` (period
summaries) and `fec_itemized_contributions`/`fec_itemized_expenditures`
(Schedule A/B).

## Scope

Two tools, following the same pattern as all 10 existing tools (pure
testable logic function + thin `registerXTool(server)` MCP wrapper using
zod, delegating to `fetchFEC` from `src/fecClient.ts`, unchanged in this
plan).

## `fec_loans`

Wraps `GET /v1/schedules/schedule_c/`, confirmed against the OpenFEC source
(`webservices/resources/sched_c.py`, `ScheduleCView`).

- **Params:**
  - `committee_id` — required, single string, uppercased before use
  - `candidate_name` — optional, fulltext
  - `loan_source_name` — optional, fulltext
  - `min_incurred_date` / `max_incurred_date` — optional, `YYYY-MM-DD`
  - `min_amount` / `max_amount` — optional (maps to `original_loan_amount`
    range in the underlying API)
  - `min_payment_to_date` / `max_payment_to_date` — optional, `YYYY-MM-DD`
  - `per_page` — default 20
- **Validation:** throws if `committee_id` is missing/empty (same pattern
  as `fec_financial_summary`/`fec_committee_reports` — single required
  scoping param, no alternative).
- **Endpoint call:** `fetchFEC("/schedules/schedule_c/", { committee_id, candidate_name, loan_source_name, min_incurred_date, max_incurred_date, min_amount, max_amount, min_payment_to_date, max_payment_to_date, per_page })`.

## `fec_debts`

Wraps `GET /v1/schedules/schedule_d/`, confirmed against the OpenFEC source
(`webservices/resources/sched_d.py`, `ScheduleDView`).

- **Params:**
  - `committee_id` — required, single string, uppercased before use
  - `creditor_debtor_name` — optional, fulltext
  - `nature_of_debt` — optional
  - `report_year` — optional, array of years
  - `min_payment_period` / `max_payment_period` — optional, `YYYY-MM-DD`
  - `min_amount_incurred` / `max_amount_incurred` — optional
  - `min_amount_outstanding_beginning` / `max_amount_outstanding_beginning` — optional
  - `min_amount_outstanding_close` / `max_amount_outstanding_close` — optional
  - `min_coverage_start_date` / `max_coverage_start_date` — optional, `YYYY-MM-DD`
  - `min_coverage_end_date` / `max_coverage_end_date` — optional, `YYYY-MM-DD`
  - `per_page` — default 20
- **Validation:** throws if `committee_id` is missing/empty (same pattern
  as `fec_loans`).
- **Endpoint call:** `fetchFEC("/schedules/schedule_d/", { committee_id, creditor_debtor_name, nature_of_debt, report_year, min_payment_period, max_payment_period, min_amount_incurred, max_amount_incurred, min_amount_outstanding_beginning, max_amount_outstanding_beginning, min_amount_outstanding_close, max_amount_outstanding_close, min_coverage_start_date, max_coverage_start_date, min_coverage_end_date, max_coverage_end_date, per_page })`.

## Testing

Same pattern as all existing tools: Vitest unit tests per tool, mocking
`global.fetch`, no network/API key required. New test files
`tests/loans.test.ts` and `tests/debts.test.ts`.

## Out of scope for this round

- Single-record lookup by `sub_id` (`/schedules/schedule_c/{sub_id}/` and
  `/schedules/schedule_d/{sub_id}/`) — the list/search endpoints cover the
  intended use case; direct sub_id lookup is niche and deferred.
- Any change to the 10 already-shipped tools.
