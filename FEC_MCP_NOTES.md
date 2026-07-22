# FEC MCP Server — Operational Notes

Target location: `C:\GitHub\fec-mcp-server\FEC_MCP_NOTES.md`

Learnings from live use of the `fec` MCP tools (candidate_search, committee_search, financial_summary, committee_reports, filings, itemized_contributions, itemized_expenditures, independent_expenditures, spending_search, donor_search) against api.open.fec.gov. Compiled July 2026.

---

## 1. Lookup-ID-first workflow

Nearly every downstream tool wants a `candidate_id` or `committee_id`, not a name. Correct sequence:

1. **Find the ID first.**
   - Candidate → `fec_candidate_search` (params: `q`, `state`, `office`, `party`, `cycle`). No direct `candidate_id` lookup param exists — if you already have an ID and just need the name/details, search by state+office+party and match the ID in results, or cross-check via the ID appearing in a `fec_committee_search` result's `candidate_ids` array.
   - Committee → `fec_committee_search` (params: `q`, `committee_id`, `candidate_id`, `state`, `party`, `committee_type`, `designation`, `organization_type`, `treasurer_name`, `cycle`). Passing `committee_id` directly works as a single-committee lookup.
2. **Then use that ID** in `fec_financial_summary` (candidate_id only — no committee-level equivalent), `fec_committee_reports` (committee_id), `fec_itemized_contributions`/`fec_itemized_expenditures`/`fec_independent_expenditures` (committee_id or candidate_id, **as an array**: `["C00123456"]`, not a bare string).
3. **`fec_financial_summary` is candidate-scoped only.** For party committees (DNC, DSCC, etc.) or anything without a candidate ID, there is no single "totals" tool — use `fec_committee_reports` instead, which gives period-by-period receipts/disbursements/cash-on-hand/debts per report.

## 2. Filing deadlines — don't mistake "not yet due" for "missing data"

- **Candidate committees**, if not on monthly filing, file **quarterly**: **Jan 31, Apr 15, Jul 15, Oct 15** (ignoring pre-/post-election reports, which are additional and election-triggered). A report period with zero results is often just not due yet, not a compliance gap.
- **PACs can file either monthly or quarterly** — check `filing_frequency` (`Q` or `M`) on the committee record before assuming a cadence.
- Monthly filers report by the 20th of the following month.
- Amendments get filed weeks after the original — always check `is_amended` / `most_recent` flags; `fec_committee_reports` defaults to showing only the current version of each report unless you explicitly ask for amended ones.

## 3. Tool-specific gotchas

- `fec_committee_search`: `q` requires **3+ characters**. `treasurer_name` is **not a standalone filter** — must be paired with at least one of `q`, `state`, `candidate_id`, or `party`, even if that other param is a near-meaningless wildcard like `q="for"`.
- No `designated_agent_name` filter exists anywhere. Only `treasurer_name` is searchable. Junior staff who only ever appear as *designated agent* (assistant treasurer) are invisible to search unless they're also treasurer-of-record on some committee — check both roles when mapping a firm's full roster.
- `fec_itemized_contributions` (Schedule A) is genuinely slow/unresponsive on FEC's own infrastructure for broad, unbounded queries — confirmed via direct curl (25s timeout, zero bytes, independent of the MCP wrapper). **Always bound with `min_date`/`max_date`.** `fec_itemized_expenditures` (Schedule B) and `fec_independent_expenditures` (Schedule E) don't have this problem.
- `fec_filings` / `fec_compliance_flags`-style tools default to `form_type: ["RFAI"]` if you don't specify — pass explicit `form_type` (e.g. `["F3X"]`) to get the actual report list instead of just compliance flags.
- If every `fec_*` tool times out at once but direct `curl` to `api.open.fec.gov` works fine, it's the MCP server itself (dead connection pool, expired key, bad timeout config), not a network/whitelist issue. Restarting the server has resolved this before.
- Rate limiting: if the server is using `DEMO_KEY` instead of a registered key, expect `429`s within ~5 calls. A registered key from api.data.gov removes this ceiling.

## 4. The `email` field — now exposed, but single-lookup only (fixed July 2026)

**Status: patched.** `fec_committee_search` now returns `email` and `website`, along with much richer detail (separate `custodian_*` and `treasurer_*` blocks, full address) — **but only when called with a single `committee_id` as a direct lookup.** Confirmed working via a live single-`committee_id` lookup, which returned populated `email`/`website` fields.

**The limitation still stands for multi-result searches.** Calling with `q`/`treasurer_name`/`state` etc. (anything returning more than one committee) still omits `email`/`website` entirely — confirmed against a 32-result `treasurer_name` search, no email field present on any row. **Practical workflow:** find the candidate roster first via `treasurer_name`/`q` search, then loop each resulting `committee_id` through an individual single-ID lookup to pull emails one at a time. There's no batch/bulk email-fetch shortcut yet.

**Why it matters:** committee emails are a strong secondary identifier for the compliance firm actually running the back office, often more reliable than street address (which can vary in formatting — "AVE" vs "AVENUE," "STE" vs "SUITE" vs "#," etc.).

## 5. `fec_loans` and `fec_debts` — now at full parity, both cross-committee searchable (updated July 2026)

Both Schedule-level tools now work the same way — either search within one committee, or search across *all* committees by the other party's name:

- **`fec_loans`** (Schedule C) — `committee_id` OR `loan_source_name` (lender/payee), optionally both, optionally narrowed further by `candidate_name`. Confirmed: `loan_source_name="Bank of America"` → 584 results across many committees, including a $20M DCCC loan.
- **`fec_debts`** (Schedule D) — `committee_id` OR `creditor_debtor_name`, optionally both. Confirmed: `creditor_debtor_name="Elias Law Group"` → 607 results spanning completely unrelated committees (a House campaign in Alaska, a Senate campaign in Iowa, and two different Super PACs) — genuine cross-committee search, not scoped to one entity.

**Both tools embed the full nested committee object** (treasurer, designated agent, cycles_has_activity, address, etc.) on each result when searching cross-committee (i.e. without a `committee_id`) — richer than what `fec_donor_search`/`fec_spending_search` return, which only give a bare `committee_id`.

**Practical use — vendor/creditor tracing across a firm's whole client roster:** instead of iterating every known committee_id one at a time, you can go the other direction: pick a known vendor or law firm and pull every committee that owes them money or borrowed from them in one call — a good cross-check for which campaigns share a compliance/legal vendor.

**Volume caveat still applies:** cross-committee or long-history queries return large unbounded result sets (Elias Law Group: 607 total; DNC alone: 7,504 debt records). Both tools support date-bounding (`min/max_incurred_date`, `min/max_payment_to_date` for loans; `min/max_coverage_start/end_date`, `report_year` for debts) — use them rather than pulling full history when the entity is high-volume.

**Reminder from before, still true:** both tools take `committee_id` as a **single string**, not an array — unlike `fec_itemized_contributions`/`fec_itemized_expenditures`/`fec_independent_expenditures`, which take `committee_id` as an array.

## 6. Additional practical notes

**Committee name ≠ candidate name — always verify before reporting.** Many committee names are first-name-only or ambiguous ("Cori for US" = Cori Bush, "Jordan for Maine" = Jordan Wood, "Verlina for Congress" = Verlina Reynolds-Jackson). Cross-check via `fec_candidate_search` (state + office + party, matching the resulting `candidate_id` back to the committee's `candidate_ids` array) before reporting a name with confidence — don't infer from the committee name alone. Also: when working from a large tool result you scrolled past earlier in a session, re-verify with a fresh call rather than relying on recall — it's easy to misread or transpose an ID out of a big JSON blob, and a wrong candidate_id silently produces a wrong-but-plausible-looking name.

**Pagination beyond page 1 isn't currently exposed.** Several cross-committee searches return large totals (Bank of America loans: 584 results / 117 pages; Elias Law Group debts: 607 results / 122 pages; DNC debts alone: 7,504 records / 376 pages), and the response includes `pagination.page` / `pagination.pages`, implying paging exists upstream — but none of the current `fec_*` tool schemas expose a `page` parameter, only `per_page` (max 100). Right now there's no way to walk past the first page of a large result set. Worth adding a `page` param if anyone needs full result sets rather than a top-N sample.

**The embedded committee object (in cross-committee `fec_loans`/`fec_debts` results) carries useful status flags** you'd otherwise need a separate `fec_committee_search` call for: `is_active`, `cycles_has_activity`, `cycles_has_financial`, `last_cycle_has_activity`. Worth checking these before assuming a committee found via creditor/lender search is still a going concern.

## 7. Firm structure pattern (general)

Larger compliance firms often have **multiple treasurer-tier principals**, each running an independent client book, backed by a shared pool of junior staff who rotate across books as *designated agent* only (never treasurer-of-record). To map a firm's true footprint:

1. Find one confirmed treasurer name at the firm's address.
2. Search `treasurer_name` for that person to get their book.
3. Check every *designated agent* name that shows up across those results — search each as `treasurer_name` too, since some will turn out to be treasurer-tier principals with their own separate book.
4. Staff who return zero committees as treasurer are agent-only — useful to note but not separate "clients" to track.

## 8. Pagination and direct candidate lookup — both fixed (July 2026)

**Pagination.** Every `fec_*` search tool now accepts a `page` parameter alongside `per_page` (max 100). Confirmed live: `fec_loans(loan_source_name="Bank of America", per_page=2, page=2)` returns `pagination.page: 2` with different rows than page 1. This closes the gap noted in section 6 above — large result sets (Bank of America loans, Elias Law Group debts, DNC's 7,504 debt records) can now be walked page by page instead of only sampling the first `per_page` rows.

**Direct candidate lookup.** `fec_candidate_search` now supports the same single-ID shortcut `fec_committee_search` got earlier: pass one `candidate_id` with no other filters (`q`/`state`/`office`/`party`) and it calls `/candidate/{id}/` directly instead of `/candidates/search/`, returning richer detail — `candidate_status`, `incumbent_challenge`, `active_through`, `election_years` — that the list endpoint doesn't include. Confirmed: `fec_candidate_search(candidate_id=["S0GA00559"])` → `candidate_status: "C"`, `incumbent_challenge: "I"`. Passing `candidate_id` alongside other filters (or more than one ID) still uses the list endpoint as before.
