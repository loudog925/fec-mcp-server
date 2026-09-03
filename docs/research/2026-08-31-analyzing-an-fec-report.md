# Research: How an FEC Report Gets Analyzed

Compiled 2026-08-31. Background research for a possible report-analysis capability
in this MCP server. This is a research note, not a spec — no implementation
decisions are final here.

**Research constraint, stated up front:** this was compiled in an environment where
`www.fec.gov` and `api.open.fec.gov` were both blocked by the network egress proxy.
Primary-source PDFs (RAD procedures, Form 3/3X instructions, materiality thresholds)
could be found and summarized through search but not fetched and read directly, and
no field name below was verified against a live API response. Everything marked
**[verify]** needs a live check before it drives code. Section 7 lists the exact
documents to pull when FEC access is available.

---

## 1. What "an FEC report" actually is

A periodic disclosure report filed by a committee. Three main forms:

| Form | Filer | Notes |
|---|---|---|
| **F3** | Authorized (candidate) committees — House/Senate | The common case for a campaign |
| **F3P** | Authorized presidential committees | Adds matching-funds lines |
| **F3X** | Unauthorized committees — PACs, super PACs, party committees | Different line numbering, adds independent expenditure / federal election activity lines |

Structurally, each report has four layers, and "analyzing a report" means something
different at each one:

1. **Cover page** — committee ID, report type (Q1/Q2/Q3/YE/M4/12P/30G/…), coverage
   start and end dates, amendment indicator, treasurer signature.
2. **Summary page** — the top-line identity of the report:
   cash on hand at the beginning of the period, total receipts, subtotal, total
   disbursements, cash on hand at close, debts owed **to** the committee, debts owed
   **by** the committee. Reported in two columns: **this period** and **cycle-to-date**.
3. **Detailed Summary Page** — receipts and disbursements broken out by line item
   (itemized individual contributions, unitemized individual contributions, party
   committee contributions, other political committee contributions, candidate
   contributions, transfers, loans, offsets, other receipts; then operating
   expenditures, transfers, loan repayments, refunds, other disbursements, and for
   F3X independent expenditures / coordinated party expenditures / federal election
   activity).
4. **Schedules** — the itemized transaction rows that roll up into the detailed
   summary lines. A, B, C, D, E, F, and for some filers H (allocation). Each schedule
   supports a specific detailed-summary line number.

The layer-3-to-layer-4 relationship is the single most important structural fact for
analysis: **every detailed summary line is an assertion that a set of schedule rows
sums to a number, and both halves are independently published.** That is what makes
automated cross-checking possible at all.

### What OpenFEC exposes of this

- `/committee/{id}/reports/` returns the cover page + summary page + detailed
  summary page as a flat JSON object per report. This is the whole of layers 1–3 in
  one call. The server already wraps this as `fec_committee_reports`.
- `/schedules/schedule_a|b|c|d|e/` return layer 4. Already wrapped as
  `fec_itemized_contributions`, `fec_itemized_expenditures`, `fec_loans`,
  `fec_debts`, `fec_independent_expenditures`.
- Schedule F (coordinated party expenditures) and Schedule H are not wrapped — see
  the gap analysis in the prior session.

**So the raw material for report analysis is already ~85% reachable through existing
tools.** What's missing is not data access, it's the computation and rule layer.

---

## 2. Three distinct analytical lenses

"Analyze this report" means different things to different users. Worth being explicit,
because the checks barely overlap.

### Lens A — Compliance review (what RAD does)
*Is this report internally consistent, complete, and free of apparent violations?*

The FEC's Reports Analysis Division employs roughly 38 analysts reviewing ~50,000
reports a year, each analyst assigned 200–400 committees. When an analyst finds an
error, omission, or apparent prohibited activity, they issue a **Request for
Additional Information (RFAI)**; the committee has 35 days to amend or respond. If
errors exceed Commission-approved thresholds, RAD refers the committee to the Audit
Division.

Documented top RFAI causes:
- Mathematical discrepancies
- Missing schedules / failure to provide supporting schedules
- Failure to properly itemize contributions and transfers from political committees
- Failure to properly itemize disbursements
- Excessive, prohibited, or otherwise impermissible contributions and transfers
- Allocated federal / non-federal activity errors
- Re-keying errors producing duplicate contributor records — which in turn hide
  excessive aggregates because the aggregate-to-date is computed per contributor record

That last one is a genuinely good target for automation: duplicate-contributor
detection is exactly the kind of fuzzy-match work a human analyst does slowly and a
tool does instantly.

### Lens B — Financial and strategic analysis (what reporters and opposition researchers do)
*Is this campaign healthy? Winning? Broke? Who's funding it?*

Standard metric set from campaign-finance journalism and consulting practice:
- **Burn rate** — disbursements ÷ receipts, per period and cycle-to-date. Values over
  1.0 mean the campaign is drawing down reserves.
- **Cash on hand and runway** — COH ÷ average monthly operating expenditures. A
  common internal "red light" rule is freezing non-essential spending when COH drops
  below two weeks of operating expenses.
- **Small-dollar share** — unitemized ÷ total individual contributions. The
  itemization threshold is $200: contributions aggregating over $200 must disclose
  name, occupation, employer and ZIP; those at or under are reported only as a lump
  sum. OpenSecrets' approach where the unitemized line is absent is to subtract
  itemized from the summary-page total. Note their caveat, which applies to us
  equally: the unitemized bucket says nothing about how many donors it represents or
  what gift sizes it contains, so "share of small-dollar donors" from this number is
  an estimate with assumptions, not a measurement.
- **Source reliance** — individual vs. PAC vs. party vs. self-funding vs. transfers.
- **Refund rate** — refunds ÷ gross contributions. Elevated values suggest either
  compliance cleanup of excessive contributions or donor churn.
- **Debt position** — debts owed by committee against COH. Net cash = COH − debts is
  frequently the real number, and it can be very different from the headline.
- **Vendor concentration** — share of disbursements to the top 1/5/10 payees.
- **Geographic profile** — in-state vs. out-of-state contribution share.
- **Trend and peer context** — this quarter vs. last quarter, vs. the same report type
  in the prior cycle, and vs. the other candidates in the same race.

### Lens C — Network and entity analysis
*Who is behind this committee, and what else are they attached to?*

This is the lens the repo's existing `FEC_MCP_NOTES.md` is already deepest on
(sections 4, 5, and 7): treasurer and designated-agent rosters, shared compliance
firms identified by committee email domain, and cross-committee vendor/creditor
tracing via `fec_loans`/`fec_debts`. It's less "analyze a report" and more "analyze
the entity a report belongs to," but users will ask for it in the same breath.

---

## 3. Check catalog

Each check below is listed with what it needs and whether the server can do it today.
This is the concrete menu to pick from when scoping a build.

### 3.1 Tier 1 — summary-line-only checks (one API call, no schedule paging)

All of these run off a single `/committee/{id}/reports/` response. Cheap, fast, and
they need **no new endpoints**.

| Check | Computation | Signal |
|---|---|---|
| **Summary math identity** | `cash_on_hand_beginning_period + total_receipts_period − total_disbursements_period` should equal `cash_on_hand_end_period` | Any nonzero delta is a mathematical discrepancy — a top RFAI cause |
| **Receipts decomposition** | Sum of the individual receipt lines should equal `total_receipts_period` | Missing or misfiled line |
| **Disbursements decomposition** | Sum of the disbursement lines should equal `total_disbursements_period` | Same |
| **Cash-on-hand continuity** | Report N's beginning COH should equal report N−1's ending COH | Detects an unamended restatement or a skipped report. Purely a cross-report check — high value, nobody gets it from reading one filing |
| **Cycle-to-date consistency** | Period column summed across the cycle's reports should track the cycle-to-date column | Detects a mis-stated YTD column |
| **Burn rate** | `total_disbursements_period ÷ total_receipts_period` | Lens B headline |
| **Runway** | `cash_on_hand_end_period ÷ (operating_expenditures_period ÷ months_in_period)` | Lens B headline |
| **Net cash** | `cash_on_hand_end_period − debts_owed_by_committee` | Lens B; often the real story |
| **Small-dollar share** | `individual_unitemized_contributions_period ÷ total_individual_contributions_period` | Lens B |
| **Source mix** | Each receipt line as a share of total receipts | Lens B |
| **Refund rate** | Refund lines ÷ gross contributions | Lens B |
| **Debt trend** | `debts_owed_by_committee` across consecutive reports | Flat debt across many periods is itself an RFAI trigger |
| **Report sequence completeness** | Report types present vs. the filing calendar for that filer's frequency | Uses `fec_calendar` filing_deadlines + the committee's `filing_frequency`. Note `FEC_MCP_NOTES.md` §2: "not yet due" is not "missing" |
| **Amendment status** | `is_amended` / most-recent flags across the set | An amended report means the original numbers are stale |

Tier 1 is, in my read, where the value-per-unit-of-work is highest by a wide margin.

### 3.2 Tier 2 — schedule-level checks (paging required)

These pull Schedule A/B/C/D rows bounded to the report's coverage period and apply
rules. Slower, and Schedule A specifically is documented in `FEC_MCP_NOTES.md` §3 as
unreliable when unbounded — but coverage-period bounding is exactly the bound it wants.

**Schedule A (receipts):**
- **Itemization reconciliation** — sum of Schedule A rows for the period vs. the
  itemized-contributions detailed summary line. A shortfall means under-itemization.
- **Excessive contributions** — aggregate per contributor per election against the
  limit. For 2025–2026: **$3,500 per election** individual-to-candidate (raised from
  $3,300), so $7,000 per cycle across primary and general; **$5,000 per calendar
  year** individual-to-PAC (not indexed); **$5,000 per election** multicandidate
  PAC-to-candidate; **$44,300 per year** individual to a national party main account
  (from $41,300), and **$132,900 per year** to the specialized party accounts (from
  $123,900). These are cycle-indexed and must be stored per cycle, not hardcoded once.
- **Duplicate contributor detection** — fuzzy match on name + address + employer to
  catch the re-keying error RAD specifically calls out, since duplicates mask
  excessive aggregates.
- **Missing employer/occupation** — required on itemized contributions; blank or
  placeholder values ("REQUESTED", "INFORMATION REQUESTED") are a best-efforts flag.
- **Prohibited-source indicators** — contributor names matching corporate patterns
  (Inc/LLC/Corp) into a candidate committee; non-US contributor country (foreign
  national); federal contractor names.
- **Date-outside-coverage** — receipt dates outside the report's coverage window.
- **Cash contributions over $100** — prohibited in currency above that.

**Schedule B (disbursements):**
- **Vague purpose descriptions** — "expenses," "reimbursement," "misc," blank. A
  documented RFAI generator.
- **Payments to individuals** with no clear purpose, and payments to names matching
  the candidate or candidate's family (personal-use exposure).
- **Vendor concentration** and top-payee ranking.
- **Reconciliation** of Schedule B period sum against the operating-expenditures line.

**Schedule C / D (loans and debts):**
- **Candidate personal loans** and their repayment status; the $250,000 post-election
  repayment limit is the classic finding here.
- **Stale debts** — same creditor, same amount, unchanged across many periods.
- **Loans without required terms** (rate, due date, security).

**Schedule E (independent expenditures):**
- **24/48-hour report timeliness** — dissemination date vs. filing receipt date.

### 3.3 Tier 3 — comparative and contextual

- **Peer comparison** — all candidates in the same race, via `/elections/`, already
  wrapped as `fec_elections`.
- **Prior-cycle comparison** — same report type, same committee, prior cycle.
- **RFAI correlation** — `fec_filings` with `form_type: ["RFAI"]` (already the tool's
  default) tied back to the report period that drew each one. This is a strong
  ground-truth signal: it tells you what the FEC itself flagged, rather than what our
  heuristics guess.

---

## 4. Important caveats any implementation has to encode

These are the ways a naive report-analysis tool produces confidently wrong output.

1. **A flag is not a violation.** Every heuristic above produces "worth checking,"
   not "broke the law." An excessive-contribution flag ignores redesignation and
   reattribution, which are legal cures. A corporate-name pattern match hits
   sole proprietorships and LLCs that are legally permissible sources in some
   configurations. The output vocabulary should be observational throughout, and the
   tool should never emit the word "violation."
2. **Amendments.** `fec_committee_reports` defaults to most-recent-only. An analysis
   run against original filings and one run against amendments give different answers,
   and which one is correct depends on the question. Must be explicit in output.
3. **Coverage periods overlap and vary.** Pre-election and post-election reports sit
   inside or alongside quarterly ones. Summing "period" columns naively double-counts.
   Coverage dates, not report types, are the source of truth.
4. **Period vs. cycle-to-date columns.** Nearly every summary field exists in both
   forms. Mixing them silently produces nonsense.
5. **Form differences.** F3, F3P, and F3X have different line structures. A single
   analysis code path that assumes F3X field names silently returns nulls for a House
   campaign. The form type must drive field selection.
6. **Candidate vs. committee scope.** A candidate may have several authorized
   committees. Per `FEC_MCP_NOTES.md` §1, `fec_financial_summary` is candidate-scoped
   and there is no committee-level totals tool — relevant to how the analysis tool
   scopes itself.
7. **Joint fundraising transfers.** Money raised by a JFC and transferred in appears
   in both entities' reports. Aggregating across related committees double-counts.
8. **Processing lag.** The processed endpoints trail the raw electronic filings by
   days. Immediately after a filing deadline, "no report" often means "not processed
   yet." The `/efile/` endpoints (unwrapped — see the gap analysis) are the fix.
9. **Not-yet-due ≠ missing.** `FEC_MCP_NOTES.md` §2, restated because a completeness
   check is the single easiest place to generate a false alarm.
10. **Unitemized ≠ number of small donors.** Per OpenSecrets' own caveat: the lump sum
    supports a dollar-share statement and not a donor-count statement.

---

## 5. Design options for building this in

### Option A — one deterministic `fec_report_analysis` tool
Input: `committee_id` (+ optional report selector / cycle). Output: structured JSON —
the report's summary lines, computed metrics, cross-report continuity results, and a
list of observations with severity and the evidence for each.

Pro: one call answers "analyze this report." All computation is deterministic and
testable with mocked fetch, matching the repo's existing Vitest pattern. Tier 1 needs
zero new endpoints.

Con: one big tool surface; risks becoming a grab-bag.

### Option B — split by tier
`fec_report_analysis` (Tier 1, summary-only, fast) and `fec_report_compliance_scan`
(Tier 2, schedule-level, slow, explicitly opt-in). Keeps the fast path fast and makes
the cost model legible to the model calling it.

### Option C — an MCP prompt / resource playbook
Ship the analyst workflow as an MCP prompt that drives the existing tools, rather than
new computation. Cheapest, and the server currently registers no prompts or resources
at all. But it puts arithmetic in the model's hands, which is exactly where
report-math checking should not live.

**My recommendation: B, phased, with a small amount of C.**

- **Phase 1** — `fec_report_analysis`, Tier 1 only. One `/committee/{id}/reports/`
  call, all math deterministic in TypeScript, form-type-aware field mapping. The
  cross-report cash-on-hand continuity check and the summary math identity are the
  two highest-value things in this entire document and both live here.
- **Phase 2** — `fec_report_compliance_scan`, Tier 2. Coverage-period-bounded schedule
  pulls with the existing keyset pagination, plus a `limits.ts` module holding
  cycle-indexed contribution limits.
- **Phase 3** — Tier 3 comparative context, reusing `fec_elections` and `fec_filings`.
- **Alongside** — an MCP prompt that frames the analyst workflow and tells the model
  which lens the user is probably in.

Phase 1 is genuinely small: it's arithmetic over a response shape the server already
fetches, and it's fully unit-testable against fixtures with no network.

---

## 6. First implementation step, before any code

Capture one real `/committee/{id}/reports/` response for each of F3, F3P, and F3X and
commit them as test fixtures. Every field name in section 3.1 is **[verify]** — from
knowledge of the API, not from a live response, because the API was unreachable from
the research environment. The repo's existing practice (`FEC_MCP_NOTES.md` documents
several cases where the obvious parameter name was wrong and only live testing caught
it — `form_type` vs `request_type`, `min_election_date` vs `min_date`) says do not
skip this.

---

## 7. Primary sources to pull when FEC access is available

Found via search but not fetchable from this environment:

- `https://www.fec.gov/documents/5765/Final-Redacted-2025-2026-RAD-Review-Referral-Procedures.pdf`
  — the current review and referral thresholds. **The specific materiality dollar
  amounts are the main factual gap in this note.**
- `https://www.fec.gov/documents/428/RAD_Review_Procedures_Feb2018.pdf` — RAD review process.
- `https://www.fec.gov/documents/5138/2021-2022_Title_52_authorized_materiality_thresholds.pdf`
  — Title 52 materiality thresholds (2021–22 edition; a 2025–26 edition should exist,
  as these are refreshed each cycle).
- `https://www.fec.gov/documents/125/fecfrm3i.pdf` — Form 3 instructions, for exact line numbering.
- `https://www.fec.gov/documents/144/fecfrm3xi.pdf` — Form 3X instructions.
- `https://www.fec.gov/documents/130/fecfrm3pi.pdf` — Form 3P instructions.
- `https://www.fec.gov/documents/5661/contribution-limits-chart-2025-2026.pdf` — limits chart.
- `https://www.fec.gov/legal-resources/enforcement/procedural-materials/` — index of
  enforcement/compliance procedural documents.
- `https://api.open.fec.gov/swagger/` — for verifying the field names in section 3.1.

## 8. Other sources consulted

- FEC RAD process overview: `https://transition.fec.gov/rad/rad_process/FEC-ReportsAnalysisDivision-RADProcesses.shtml`
- FEC e-filing study, recommendation 2 (help filers report correctly, top RFAI issues
  of 2016): `https://www.fec.gov/about/reports-about-fec/agency-operations/e-filing-study-2016/recommendation-2-help-filers-report-correctly/`
- RAD FAQs on internal controls (bank reconciliation, cash-on-hand discrepancy
  research): `https://www.fec.gov/resources/cms-content/documents/policy-guidance/RAD_FAQs-Internal_Controls_last_visited_may_5_2021.pdf`
- OpenSecrets methodology: `https://www.opensecrets.org/campaign-expenditures/methodology`
- OpenSecrets on small vs. large contributions: `https://www.opensecrets.org/news/2012/05/opensecrets-mailbag-small-vs-large/`
- FollowTheMoney, "No Small Change" (unitemized share analysis): `https://www.followthemoney.org/research/institute-reports/no-small-change`
- Center for Public Integrity on burn rate: `https://publicintegrity.org/politics/presidential-candidates-democrats-money-burn-rate/`
- 2025–2026 contribution limit increases: `https://www.insidepoliticallaw.com/2025/01/30/fec-raises-contribution-limits-for-2025-2026/`
  and `https://www.wiley.law/alert-FEC-Raises-Individual-Federal-Contribution-Limits-for-2025-2026-Election-Cycle`
