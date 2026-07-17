# FEC MCP Server — Committee & Filings Tools — Design

Date: 2026-07-17

## Purpose

Extend `fec-mcp-server` with the OpenFEC coverage its 8 existing tools are
missing, identified by comparing against the standalone PowerShell scripts in
`C:\GitHub\FEC-API` (a pre-existing, unrelated collection of ad-hoc scripts
that call the same OpenFEC API directly). Those scripts rely heavily on
committee-level lookups and period-by-period financial reports that the
current 8 tools have no equivalent for, and use general filing search more
broadly than the current RFAI-scoped `fec_compliance_flags` tool supports.

This also captures a bug found and already fixed during this investigation:
`fec_compliance_flags` defaulted to `request_type: ["RFAI"]`, which silently
returns zero results against the live API. The correct parameter is
`form_type: ["RFAI"]` (confirmed directly against `api.open.fec.gov`: the
wrong param returned 0 results, the correct one returned 83 real RFAI
filings for the same committee). That fix has already shipped
(commit `1d51d1a`) as a standalone bug fix; this spec builds on top of it.

## Scope

Three tools, all following the same pattern established by the existing 8
(pure testable logic function + thin `registerXTool(server)` MCP wrapper
using zod):

1. **`fec_committee_search`** (new)
2. **`fec_committee_reports`** (new)
3. **`fec_filings`** (renamed and broadened from `fec_compliance_flags`)

## `fec_committee_search`

Wraps `GET /v1/committees/`, confirmed against the OpenFEC source
(`webservices/resources/committees.py`, `CommitteeList`).

- **Params (all optional, at least one required — same validation pattern
  as `fec_candidate_search`):**
  - `q` — fulltext committee name search
  - `committee_id` — array, direct lookup by ID(s)
  - `candidate_id` — array, find a candidate's affiliated committees
  - `state` — two-letter state code
  - `party` — party code
  - `committee_type` — FEC committee type code
  - `designation` — FEC designation code
  - `organization_type` — FEC organization type code
  - `cycle` — array of two-year cycles
  - `treasurer_name` — fulltext treasurer name search
  - `per_page` — default 20
- **Validation:** throws if none of `q`, `committee_id`, `candidate_id`,
  `state`, `party` are provided (mirrors `fec_candidate_search`'s "at least
  one of q/state/office/party" rule, adapted to committee fields).
- **Endpoint call:** `fetchFEC("/committees/", { q, committee_id, candidate_id, state, party, committee_type, designation, organization_type, cycle, treasurer_name, per_page })`.

This single tool covers both "search committees by name/state/party" and
"look up one committee by ID" (pass `committee_id: ["C00401224"]`), matching
the one-tool-per-concept pattern used by every other tool in this server —
no separate detail tool.

## `fec_committee_reports`

Wraps `GET /v1/committee/{committee_id}/reports/`, confirmed against the
OpenFEC source (`webservices/resources/reports.py`, `CommitteeReportsView`).
This is the period-by-period financial report endpoint (cash on hand,
receipts, disbursements, debts *per reporting period*) — distinct from
`fec_financial_summary`'s cycle-level totals via `/candidate/{id}/totals/`.

- **Params:**
  - `committee_id` — required, single string
  - `cycle` — optional array of two-year cycles
  - `year` — optional array of years
  - `is_amended` — optional boolean; when explicitly provided, `most_recent`
    is omitted so the caller sees both original and amended versions as
    requested
  - `min_receipt_date` / `max_receipt_date` — optional, `YYYY-MM-DD`
  - `min_receipts_amount` / `max_receipts_amount` — optional
  - `min_disbursements_amount` / `max_disbursements_amount` — optional
  - `min_cash_on_hand_end_period_amount` / `max_cash_on_hand_end_period_amount` — optional
  - `min_debts_owed_amount` / `max_debts_owed_amount` — optional
  - `per_page` — default 20
- **Default behavior:** when `is_amended` is not provided, the tool passes
  `most_recent: true` to the API so results reflect only the current version
  of each report. When `is_amended` is explicitly provided (true or false),
  `most_recent` is omitted, letting the caller see amendment history as
  requested — matches the "care about the current version unless checking
  what changed" rule.
- **Endpoint call:** `fetchFEC(`/committee/${committee_id}/reports/`, { cycle, year, is_amended, most_recent: is_amended === undefined ? true : undefined, min_receipt_date, max_receipt_date, min_receipts_amount, max_receipts_amount, min_disbursements_amount, max_disbursements_amount, min_cash_on_hand_end_period_amount, max_cash_on_hand_end_period_amount, min_debts_owed_amount, max_debts_owed_amount, per_page })`.

## `fec_filings` (renamed from `fec_compliance_flags`)

Same underlying endpoints as today (`/candidate/{id}/filings/` or
`/committee/{id}/filings/`, exactly one of `candidate_id`/`committee_id`
required — validation unchanged), with the already-fixed `form_type` param
(default `["RFAI"]`) now framed as a general filing-type filter rather than
RFAI-only, so Claude reaches for this tool on general "what has this
committee filed" questions, not just compliance/RFAI checks.

- **Params (unchanged from the current shipped shape, param already fixed):**
  `candidate_id`, `committee_id` (exactly one required), `form_type`
  (optional array, defaults to `["RFAI"]`), `is_amended` (optional),
  `per_page` (default 20).
- **Changes in this round:**
  - Rename the exported function `complianceFlags` → `filings`, and
    `registerComplianceFlagsTool` → `registerFilingsTool`.
  - Rename the MCP tool name `fec_compliance_flags` → `fec_filings`.
  - Rename the file `src/tools/compliance.ts` → `src/tools/filings.ts`, and
    `tests/compliance.test.ts` → `tests/filings.test.ts`.
  - Broaden the tool's description from "Check ... for compliance flags" to
    something like "Get a candidate's or committee's filings, optionally
    filtered by form type (defaults to RFAIs) or amendment status" so it
    reads as general-purpose, not RFAI-specific.
  - No behavior change beyond the rename/re-description — the `form_type`
    fix already shipped separately.
- **Discovery path:** no unscoped/`q_filer` search mode is added. To find a
  `candidate_id` or `committee_id` you don't already have, use
  `fec_candidate_search` or the new `fec_committee_search` first, then pass
  the resulting ID into `fec_filings`.

## Testing

Same pattern as the existing 8 tools: Vitest unit tests per tool, mocking
`global.fetch`, no network/API key required. `fec_committee_search` and
`fec_committee_reports` get new test files; `fec_filings` reuses/renames
the existing `compliance.test.ts` tests (already updated for the
`form_type` fix), adjusting for the renamed function/file.

## Out of scope for this round

- Committee history (`/v1/committee/{id}/history/`) — JFC/affiliated-committee
  lookups, niche, deferred.
- E-filing search (`/v1/efile/filings/`) — filer-name search over raw
  e-filings before they're processed into the main filings index, niche,
  deferred.
- Unscoped/`q_filer` general filing search — discovery is handled via
  `fec_candidate_search`/`fec_committee_search` instead (see above).
- Any change to the 8 already-shipped tools beyond the `fec_compliance_flags`
  → `fec_filings` rename described above.
