# Implementing the Primer: Mapping the Framework onto OpenFEC

Companion to `fec-report-analysis-primer.md`. Section numbers below refer to that
document. Purpose: for each analytical move the primer asks for, establish what data
it needs, whether OpenFEC provides it, and what has to be built.

**Provenance of field names in this document.** `api.open.fec.gov` and `www.fec.gov`
are blocked by this environment's egress proxy, so nothing here was verified against a
live API response. However, `raw.githubusercontent.com` *is* reachable, so the field
names below were read out of OpenFEC's own source — `webservices/common/models/`
(`reports.py`, `itemized.py`, `aggregates.py`) and `webservices/docs.py`. That's
authoritative for what the API *defines*; it doesn't prove what a given committee's
response actually populates. Anything still unconfirmed is marked **[verify]**.

---

## 0. Three findings that change the build

Before the section-by-section map, the three things worth leading with.

### 0.1 The memo-entry trap is a one-field check

The primer's §5, §7 and §20 all turn on memo entries, and treats them as the biggest
double-counting hazard. OpenFEC handles this natively. From `docs.py`, on `memo_code`:

> "'X' indicates that the amount is NOT to be included in the itemization total."

So both Schedule A and Schedule B rows carry `memo_code` / `memo_code_full` /
`memo_text`, and the rule is: **exclude rows where `memo_code === 'X'` from any cash
total; keep them for donor and vendor attribution.** That is exactly the distinction
the primer draws in §5 ("for journalistic donor analysis, the underlying contributor
entries are extremely useful; for cash accounting, use the actual transfer").

Better still, the Schedule B aggregate models already do this for us — they total a
column literally named **`non_memo_total`**. So the spending rollups are memo-safe by
construction.

This means the primer's hardest-to-get-right rule is close to free to implement.

### 0.2 Late money (§17) is a flag, not a separate pipeline

`docs.py` on `is_notice`:

> "Record filed as 24- or 48-hour notice."

So the 48-hour contribution notices and 24/48-hour independent expenditure notices the
primer wants checked in §17 are reachable as a boolean on itemized records, rather than
requiring a separate filings-based workflow. That's a much cheaper implementation than
expected.

### 0.3 The functional-category work is half done, and §6 needs a two-layer approach

Schedule B has a native derived field, `disbursement_purpose_category`, and there is a
`ScheduleBByPurpose` aggregate keyed on `purpose` with `non_memo_total`. `docs.py`
describes the purpose as "a combination of transaction codes, category codes and
disbursement description."

But FEC's category set is coarser than the primer's 11 functional categories — it does
not separately distinguish, say, Digital from Media, or Field from Payroll. So §6 needs:

- **Layer 1:** FEC's `disbursement_purpose_category` as the base classification, free
  and consistent.
- **Layer 2:** rules over `disbursement_description` and `recipient_name` to split
  Layer 1's coarse buckets into the primer's categories.
- **Layer 3, non-negotiable:** report the **unclassified share** as a first-class
  number. A category breakdown that silently buries 30% in "other" invites exactly the
  overconfident reading §8 warns against.

The exact value list for `disbursement_purpose_category` is not documented in
`docs.py` and must be enumerated empirically from live data. **[verify]**

---

## 1. Section-by-section map

Legend: **Ready** = buildable with tools/endpoints already wrapped. **Wrap** = OpenFEC
has it, this server doesn't expose it yet. **Build** = logic we write. **Gap** = not
obtainable from the API.

### §1 — Know what you're looking at

| Item | Source | Status |
|---|---|---|
| Committee identity, type, designation | `/committee/{id}/` — already wrapped | Ready |
| Form type (F3 / F3P / F3X) | report record's form type; drives all field selection | Ready |
| Coverage dates | `coverage_start_date`, `coverage_end_date` | Ready |
| Amendment status | `is_amended`; `fec_committee_reports` already defaults to most-recent-only | Ready |
| **The candidate's full committee ecosystem** | `/committees/?candidate_id=X`, then split on `designation` | Ready |

That last row is the useful one. The primer's §1 and §16 both ask for the set of
entities around a candidate, and committee `designation` codes give it directly:
`P` principal campaign committee, `A` other authorized, `J` joint fundraising
committee, `D` leadership PAC, `U` unauthorized. So "find this candidate's leadership
PAC and JFCs" is one already-wrapped call plus a filter — no new endpoint. **[verify
the code letters against live data.]**

### §2 — The four numbers

All verified present on the reports models:
`cash_on_hand_beginning_period`, `cash_on_hand_end_period`, `total_receipts_period`,
`total_disbursements_period`, `debts_owed_by_committee`, `debts_owed_to_committee`.

Effective cash position = `cash_on_hand_end_period − debts_owed_by_committee`. **Ready.**

**One caution to add to the primer.** §2 notes that on Form 3, Column A is the
reporting period and Column B is *election-cycle*-to-date. But the API's second column
is suffixed **`_ytd`** — *year*-to-date naming. Whether F3's `_ytd` fields actually
carry cycle-to-date values (matching the paper form) or true calendar-year values is
not resolvable from the models alone and is a live-data question. **[verify]** — and
it's the kind of mismatch that silently produces wrong "cycle to date" numbers, which
is exactly the class of bug `FEC_MCP_NOTES.md` was created to record.

### §3 — Total receipts ≠ money raised

The primer says FEC uses an "adjusted receipts" methodology. **Finding: no field
containing "adjusted" exists in the reports models.** What does exist is
`net_contributions_period` and `net_operating_expenditures_period`.

So we cannot read FEC's adjusted-receipts figure off the API; we have to compute our
own and document the formula. Proposed, for F3:

```
fundraising_receipts = total_receipts_period
                     − total_loans_received_period
                     − transfers_from_other_authorized_committee_period
                     − total_offsets_to_operating_expenditures_period
                     − other_receipts_period
```

All five field names verified present. This becomes the denominator for §9's operating
burn. **Because it's our formula and not FEC's, output must label it as ours and show
the components** — otherwise we've invented an authoritative-looking number, which is
the precise failure mode §20 warns against.

### §4 — Fundraising profile

| Metric | Fields / endpoint | Status |
|---|---|---|
| Individual total, itemized, unitemized | `total_individual_contributions_period`, `individual_itemized_contributions_period`, `individual_unitemized_contributions_period` | Ready |
| PAC share | `other_political_committee_contributions_period` | Ready |
| Party share | `political_party_committee_contributions_period` | Ready |
| Candidate money | `candidate_contribution_period` + `loans_made_by_candidate_period` (F3) | Ready |
| Geographic concentration | `/schedules/schedule_a/by_state/` (`state`, `total`) | **Wrap** |
| Employer / occupation clustering | `by_employer` (`employer`), `by_occupation` (`occupation`) | **Wrap** |
| Contribution size profile | `by_size` (`size`, `total`) | **Wrap** |
| **Top-10 donors** | **No `by_contributor` aggregate exists** | **Build** — must page Schedule A and group by contributor, date-bounded to the coverage period |

**A real nuance on `by_size` worth encoding.** From `docs.py`, the buckets are
`$200 and under`, `$200.01–$499.99`, `$500–$999.99`, `$1000–$1999.99`, `$2000+`, and:

> "The $200.00 and under category includes contributions of $200 or less combined with
> unitemized individual contributions."

So `by_size`'s bottom bucket is *not* the same population as the unitemized line — it
mixes small itemized gifts with the unitemized lump. Using them interchangeably would
be a quiet error, and it reinforces §4's insistence that the unitemized share be
described precisely.

**Gap analysis against a legacy report (`Sample_FecContributionBreakdown.pdf`, run
2012-10-01).** An older product report built the same "fundraising profile" idea. Its
row structure — Individual (Itemized / Unitemized), PAC, Joint Fundraiser broken into
its Individual-origin and PAC-origin components, rolled up to Total Individual/PAC/Party
Committee/Candidate/Total — is a cleaner version of §5's JFC memo-attribution rule than
anything built so far: it doesn't just flag memo rows, it re-sorts memo-coded JFC
contributions back into the underlying contributor-type buckets (Individual vs PAC) and
rolls that into the same totals as direct gifts. Nothing currently in this repo does that
re-sorting — `fec_contribution_breakdown` and the memo rule in `implementing-the-primer.md`
§5 identify memo rows but don't reclassify them by underlying contributor type. Worth
building as a real Phase 2/3 item, not just documenting.

Four other things the legacy report did that nothing here does yet:

1. **In-state vs. out-of-state as a first-class binary cut**, not just full `by_state`
   detail. Useful because "how much of this is from home-state donors" is usually the
   actual question, and a 50-row state table makes the caller compute that themselves.
   Cheap to add as a derived summary over `fec_contribution_breakdown`'s `by_state`
   results (sum the row matching the committee's own state vs. everything else) — no
   new endpoint needed.
2. **Distinct contributor counts, not just contribution counts.** Every one of the
   legacy report's tables reports contributions and contributors side by side (e.g. 2
   itemized contributions from 1 distinct contributor). OpenFEC's `by_*` aggregates only
   give a contribution `count`, never a distinct-contributor count — getting that
   requires paging raw Schedule A and deduping by `contributor_id`, which is a Phase 3,
   paging-dependent cost matching the primer's top-10-donors item. Worth building
   alongside that rather than separately.
3. **Average-per-day**, i.e. total ÷ length of the covered period. This is exactly the
   per-day normalization §9 already flagged as missing when comparing periods of
   different lengths (see the burn-rate note above) — `fec_filing_review` computes
   `coverage_days` per report already, so this is a one-line addition: divide any
   period total by its `coverage_days`.
4. **A missing-information / data-completeness flag** — the legacy report's "Have
   Information / Do Not Have Info" table reports what share of contributions (and
   contributors) lack identifying fields. This matters specifically because it caps how
   much to trust `by_state`/`by_employer`/`by_occupation`: if 20% of a committee's
   itemized rows have a null `contributor_state`, the geographic-concentration
   breakdown is silently understating everywhere-else money, in the same spirit as the
   primer's own §20 discipline about not presenting a derived number without its
   caveat. Not currently computed anywhere — would need a raw Schedule A pass (null
   rate for `contributor_state`/`contributor_employer`/`contributor_occupation`) rather
   than the aggregates, since the aggregates don't expose a null-count.

**High-dollar / low-dollar framing — a distinct cut from the size buckets above.**
`by_size`'s five buckets are useful raw material but nobody asks "what's my $500–999.99
share" — the actual recurring question, in both campaign self-reporting and press
coverage, is binary: **what share of the money is small-dollar/grassroots vs. large-
dollar/max-out-reliant.** Two things worth separating, at two different confidence
levels:

- **Cheap and buildable now, no new endpoint.** A "grassroots share" derived metric —
  unitemized contributions plus the itemized-$200-and-under bucket, as a percentage of
  `total_receipts_period` — and a "large-dollar share" using `by_size`'s top `$2000+`
  bucket the same way. Both are a summary layer over data `fec_contribution_breakdown`
  already returns, the same pattern as `fec_spending_breakdown`'s
  `unclassified_share_by_group`. **Caveat that has to travel with this number**: FEC's
  `$2000+` bucket is a fixed reporting-threshold artifact, not "maxed out to the legal
  limit" — the actual per-election individual limit is $3,500 for the 2025–2026 cycle
  (up from $3,300 for 2023–2024; FEC raises it every odd year for inflation — see
  sources below), and it applies **per election**, so a donor can legally give $3,500
  for the primary and another $3,500 for the general, $7,000 total, without tripping any
  single-contribution flag. A "large-dollar share" computed off the `$2000+` bucket is a
  reasonable proxy for "not itemized-small," but it is not the same claim as "this
  committee is reliant on maxed-out donors," and should not be labeled that way.
- **The actually-precise version needs paging, and belongs with the other
  paging-dependent work.** To say *how much of a committee's money comes from donors at
  or near their legal cap* requires raw Schedule A rows and each contributor's
  `contributor_aggregate_ytd` (already confirmed present on live rows — see §0.1's memo
  finding) compared against $3,500 (or $7,000 cycle-to-date across both elections,
  watching for the cycle-to-date-not-calendar-year-to-date field-naming trap already
  documented in the §3 verification section). That's the same contributor-level
  dedup/aggregation cost as the legacy report's distinct-contributor-count item and the
  primer's top-10-donors item above — group this with Phase 3, not Phase 2.

Sources for the $3,500/$7,000 figures: [FEC — Contribution limits](https://www.fec.gov/help-candidates-and-committees/candidate-taking-receipts/contribution-limits/),
[FEC 2025–2026 contribution limits chart (PDF)](https://www.fec.gov/resources/cms-content/documents/contribution-limits-chart-2025-2026.pdf).

### §5 — Joint fundraising committees

Implementable as the primer specifies:
- Cash figure = the transfer: `transfers_from_other_authorized_committee_period`.
- Donor attribution = Schedule A rows where `memo_code === 'X'`.
- **Never sum the two.**

The JFCs themselves are discoverable via `designation = 'J'` per §1. **Ready** once the
memo rule is implemented.

### §6 — Functional spending categories

See §0.3. `ScheduleBByPurpose` (`purpose`, `non_memo_total`) is a **Wrap**; the
two-layer classifier and the unclassified-share reporting are a **Build**.

### §7 — The payee is not the ultimate vendor

Directly implementable. Credit-card and payroll pass-throughs surface as Schedule B
rows with `memo_code === 'X'` beneath a parent payment. So the tool can do what §7
asks — show the parent payee *and* drill into the underlying merchants — and, critically,
it can refuse to characterize the parent payment's category when memo children exist.

The deeper limit stands and cannot be fixed: a media buyer's subvendors are simply not
in FEC data. That belongs in the output's caveats, not in a metric.

### §8 — Purpose descriptions

`disbursement_description` verified present. **Ready.**

### §9 — Burn

- Headline burn = `total_disbursements_period ÷ total_receipts_period`. **Ready.**
- Operating burn = `total_operating_expenditures_period ÷ fundraising_receipts` (§3
  formula). **Ready**, with the labeling requirement.
- Cash accumulation = `cash_on_hand_end_period − cash_on_hand_beginning_period`. **Ready.**

**One refinement to the primer.** §9 lists in-kind transactions among the distortions
to burn rate, and §12 says to exclude in-kind from cash-flow analysis. Worth being
precise about which metric each affects: because an in-kind appears as both a receipt
and a disbursement, it **cancels out of cash accumulation** (ending − beginning is
unaffected) but **does** distort burn rate, since it inflates numerator and denominator
by the same absolute amount and therefore pulls the ratio toward 1.0. So in-kind
exclusion matters for §9's burn ratios and is a no-op for §9's cash accumulation.

Also: burn rate is sensitive to coverage-period length, so comparing a 12-day
pre-primary report's burn to a 92-day quarterly report's burn is not meaningful without
normalizing per day. This strengthens §15's point and extends it to §9's own formula.

**Identifying in-kind is the one genuinely unresolved item.** In-kind receipts should
be identifiable via Schedule A `receipt_type` codes and Schedule B `disbursement_type`,
both verified present, but the specific code values for in-kind are not documented in
`docs.py`. **[verify]** — this needs live data or the form instructions.

### §10 — Debt

`debts_owed_by_committee` across consecutive reports; debt load =
debts ÷ cash on hand. Schedule C and D already wrapped as `fec_loans` / `fec_debts`,
both of which per `FEC_MCP_NOTES.md` §5 support date bounding. **Ready.**

### §11 — Refunds

`total_contribution_refunds_period` and `refunded_individual_contributions_period`
verified present. Refund rate computable. **Ready.**

### §12 — In-kind

See §9 above. **Blocked on the receipt_type code list. [verify]**

### §13 — Timing

Requires paging Schedule A and B for the coverage window and bucketing by date.
`FEC_MCP_NOTES.md` §3 warns Schedule A is unreliable unbounded — but a coverage-period
bound is exactly the bound it wants, and keyset pagination is already implemented.
**Build**, moderate cost.

### §14 — Compare against the previous report

Every row of the primer's change table maps to a verified field. Pull N reports in one
call and diff. **Ready** — and this is the single highest value-per-effort item in the
whole framework.

### §15 — Compare against the right opponent

- Race field and financials: `/elections/` — already wrapped as `fec_elections`.
- **The primer's "has the primary already happened" check is programmable**: compare
  the report's `coverage_end_date` against the race's primary date from
  `fec_calendar`'s `election_dates` mode. That converts §15's cautionary anecdote into
  an automatic guard. Worth doing — it's the comparison error most likely to survive
  into print.

### §16 — The report is not the whole campaign

| Component | Endpoint | Status |
|---|---|---|
| IEs for/against the candidate | `/schedules/schedule_e/by_candidate/` (`cand_id`, `support_oppose_indicator`, `total`) | **Wrap** |
| Electioneering communications | `ElectioneeringByCandidate` (`cand_id`, `total`) | **Wrap** |
| Communication costs | `CommunicationCostByCandidate` (`cand_id`, `support_oppose_indicator`, `total`) | **Wrap** |
| Leadership PAC, JFCs, authorized committees | committee `designation` per §1 | Ready |
| Party coordinated expenditures | Schedule F | **Wrap** |

All three by-candidate aggregate models are confirmed to exist in `aggregates.py`. This
is the cleanest possible implementation of §16 — the "outside spending for/against this
candidate" number is one call per source, already aggregated.

**A 2026 addition to §16.** The primer's closing caution is right, and the holding
sharpens it. In *NRSC v. FEC*, decided June 30, 2026, the Court held FECA's political-party
coordinated-expenditure limits violate the First Amendment, overruling *Colorado II*
(2001). The majority reasoned the limits were disproportionate "in light of other
meaningful prophylactic measures available to the Government," naming **earmarking and
disclosure requirements** as those measures.

The analytical consequence: party coordinated spending is now unlimited but still
disclosed. Schedule F therefore moves from a minor line to a potentially major channel
for money in a competitive 2026 race — and it is one of the schedules this server does
not wrap. For §16's purposes that raises Schedule F from "completeness nice-to-have" to
a live reporting need.

### §17 — Late money

`is_notice` on itemized records (§0.2), plus `/filings/` by form type for the notice
filings themselves. **Ready** for the flag; the "what's been filed since the last
report" question is better served by the `/efile/` endpoints, which are **Wrap**.

### §18 — Derived metrics

Every metric maps to verified fields and is computable, with three notes:
- **Candidate financing share** — the primer's denominator, "total financial inflows,"
  needs pinning down. Recommend `total_receipts_period`, stated explicitly in output.
- **Operating burn** — depends on our §3 formula, must be labeled as ours.
- **Top-10 donor concentration** — the only metric requiring schedule paging; and the
  primer is right that it must be labeled a measure of *itemized* fundraising.

### §19 / §20 — Story leads and mistakes

§19's leads are all computable from the above. §20's rules should be **encoded in
output, not just documented** — a `caveats` array populated per figure returned. The
memo rule, the unitemized-vs-donors rule, the payee rule, and the coverage-period rule
are each now mechanically checkable, so the tool can attach the caveat precisely when
the condition that triggers it is present, rather than boilerplating all of them.

---

## 2. The 15-minute review as a tool

The primer's closing checklist is already a tool spec. Proposed as
**`fec_filing_review`**, mirroring the eight steps:

| Step | Implementation | New endpoints needed |
|---|---|---|
| 1. Verify the report | `/committee/{id}/`, `/committee/{id}/reports/`, plus ecosystem via `designation` | None |
| 2. Seven numbers | verified summary fields, form-type-aware | None |
| 3. Compare with previous | diff across N reports; cash growth, burn, debt change | None |
| 4. Scan Schedule A | top donors (paged), `by_state`/`by_employer`/`by_size`, JFC memo split, `is_notice` | by_* aggregates |
| 5. Scan Schedule B | `by_recipient` + `by_purpose` (memo-safe), two-layer categories, memo drill-down | by_* aggregates |
| 6. Schedule C and D | existing `fec_loans` / `fec_debts` | None |
| 7. Broader ecosystem | `schedule_e/by_candidate`, electioneering, comm costs, leadership PAC, JFC | three by-candidate aggregates |
| 8. One sentence | **not computed** — see below | None |

**Step 8 is the design crux.** The tool should not write the sentence. It should return
the structured evidence — the change table, the metrics, the flagged leads, the caveats
— and let the model calling it do the synthesis. Deterministic arithmetic in TypeScript,
narrative judgment in the model. That division also means step 8's discipline is
preserved: the model can only complete "this report shows a campaign that ___" from
evidence the tool actually returned.

### Phasing

**Phase 1 — steps 1, 2, 3, 6 and the §15 period guard. Done**, as `fec_filing_review`
(`src/tools/filingReview.ts`, tested in `tests/filingReview.test.ts` against the fixtures
in `tests/fixtures/`, live-smoke-tested against Ossoff 2026, the DNC, and Harris 2020).
Delivers §1, §2, §3, §9, §10, §11, §14, §18 (minus top-10), and the primer's core
principle. This is arithmetic over one `/committee/{id}/reports/` response plus already
wrapped tools, and it's fully unit-testable against fixtures with no network.

**Phase 2 — wrap the aggregates**, then steps 4, 5 and 7. Unlocks §4's clustering and
§6/§7's spending categorization. This is where most of the remaining in-scope primer
value sits.

- **§4 (contribution clustering) and part of §6/§7 (spending by purpose/recipient): done**,
  as `fec_contribution_breakdown` (`by_state`/`by_employer`/`by_occupation`/`by_size`) and
  `fec_spending_breakdown` (`by_purpose`/`by_recipient`) — `src/tools/contributionBreakdown.ts`,
  `src/tools/spendingBreakdown.ts`. `by_purpose` mode computes `unclassified_share_by_group`
  per the §0.3 Layer 3 requirement (live-verified: 35% of Ossoff 2026's disbursements fall
  in FEC's own `OTHER` bucket). `by_size` mode computes `size_profile_by_group`
  (grassroots vs. large-dollar share) and `by_state` mode computes
  `geographic_summary_by_group` (in-state vs. out-of-state, when `home_state` is
  supplied) — both from the legacy-report gap analysis above, live-verified against
  Ossoff 2026 (69% grassroots, 21% in-state). `fec_filing_review`'s report summaries
  also carry `receipts_per_day`/`disbursements_per_day` now, from the same gap analysis.
- **Deferred, on purpose**: the §0.3 Layer 2 rules-based sub-classifier that would split
  FEC's 12 coarse purpose categories into the primer's finer functional categories
  (Digital vs Media, Field vs Payroll). Likely worth building eventually, but the rules
  would be judgment calls rather than mechanical lookups, so it's deferred rather than
  built speculatively.

**§16 (outside spending) is out of scope for this tool line, not just unbuilt.** It was
originally slotted into Phase 2, but on reflection it doesn't fit the unit of analysis
`fec_filing_review` and its companions are built around: a specific committee's own
filing. §16 — independent expenditures for/against a candidate, electioneering
communications, communication costs, Schedule F — is race-level, opponent-aware
analysis, not report analysis. It belongs in a different tool (something more like a
race/ecosystem overview, built around `fec_elections` and a candidate rather than a
committee's report), not bolted onto the filing-review line. Left off the phasing list
below; revisit if/when that separate tool gets scoped.

**Phase 3 — the paging-dependent pieces:** top-10 donors (§18), distinct contributor
counts and the JFC memo re-sort (both from the legacy-report gap analysis, bundled here
since they share the same per-contributor paging cost), the precise maxed-out-donor
share (same bundle, via `contributor_aggregate_ytd`), timing curves (§13), memo
drill-down (§7), and the missing-info/data-completeness flag (legacy-report gap
analysis).

**Deferred pending resolution:** §12 in-kind exclusion, blocked on the receipt_type
code list.

---

## 3. Verification checklist — resolved 2026-09-01 against live data

All eight items below were checked against `api.open.fec.gov` directly (via committees
like ActBlue, DNC, RNC, the DNC's JFCs, Kamala Harris's Senate/2020-presidential
committees, and Jon Ossoff's 2026 Senate committee) and against OpenFEC's own source at
`raw.githubusercontent.com/fecgov/openFEC/develop/`. Fixtures captured in
`tests/fixtures/committee-reports-f3.json` (Ossoff Senate, 2026), `-f3x.json` (DNC,
2026), `-f3p.json` (Harris for President, 2019).

1. **`memo_code === 'X'` marks memo rows — confirmed.** Live Schedule A values are only
   `null` or `'X'`. **Correction to §0.1/§0.3's field name**: the Schedule B aggregate
   field is just **`total`**, not `non_memo_total` — no field of that name exists on the
   live response. But it behaves as advertised: confirmed empirically on a joint
   fundraising committee (10,000 Lakes Victory) where a size bucket's raw non-memo sum
   ($73,600) matched the aggregate's `total` exactly, excluding a $5,200 memo row from
   the same bucket. `ScheduleBByPurpose` additionally exposes `memo_count`/`memo_total`
   alongside `total`, so the memo amount is separately visible, not just excluded.
2. **F3 `_ytd` is cycle-to-date, not calendar-year-to-date — confirmed, and this was the
   right thing to check.** Traced Kamala Harris for President's (`C00694455`) YTD
   receipts across the 2019→2020 boundary: YE 2019 report shows
   `total_receipts_ytd: 40,900,976.24`; the very next report (Q1 2020) shows
   `total_receipts_period: 182,396.35` and `total_receipts_ytd: 41,083,372.59` —
   40,900,976.24 + 182,396.35 = 41,083,372.59. It accumulates straight through the
   calendar-year boundary with no reset, matching Form 3's Column B (cycle-to-date), not
   the field name's literal implication. Fixture: `committee-reports-f3p.json`.
3. **In-kind has no dedicated code anywhere in the schema — this is a Gap, not a
   `[verify]`.** Sampled `receipt_type`/`receipt_type_desc` and
   `disbursement_type`/`disbursement_type_description` across ActBlue, DNC, RNC, and
   both Harris committees, several date ranges each: observed codes are ordinary
   transaction-type codes (`15` Contribution, `15E` Earmarked, `18G`/`24G` Transfer,
   `24K` Contribution Made to Non-Affiliated, etc.) — nothing resembling "in-kind."
   `RECEIPT_TYPE_CODES`/`DISBURSEMENT_TYPE_CODES` in `docs.py` turned out to be a
   different, narrower thing than assumed: national-party-account codes (30/31/32,
   40/41/42) for conventions/HQ buildings/recounts only, not a general in-kind
   indicator. Checked `reports.py` too — no `*_in_kind_*` field exists at the report
   level either. **§9/§12's in-kind exclusion is not obtainable from any structured
   field.** It can only be approximated heuristically (matching a same-day, same-amount
   receipt/disbursement pair, or free-text matching on `disbursement_description`/
   `receipt_type_desc` for "IN KIND" / "IN-KIND"), and that heuristic will miss cases.
   Recommend the Phase 3 (or later) in-kind work lead with that caveat rather than
   present a number.
4. **`disbursement_purpose_category` value list — resolved authoritatively, not just
   sampled.** Live sampling across six committees (ActBlue, DNC, RNC, both Harris
   committees, Ossoff) turned up 11 values and missed one — `webservices/args.py`'s
   `disbursment_purpose_list` (the actual validator FEC's own API uses to reject
   invalid `purpose` filter values) gives the authoritative, exhaustive list of 12:
   `ADMINISTRATIVE`, `ADVERTISING`, `CONTRIBUTIONS`, `EVENTS`, `FUNDRAISING`,
   `LOAN-REPAYMENTS`, `MATERIALS`, `OTHER`, `POLLING`, `REFUNDS`, `TRANSFERS`,
   `TRAVEL`. `fec_spending_breakdown`'s `purpose` param is validated against this exact
   list.
5. **Committee `designation` codes — all five confirmed live**: `/committees/?designation=X`
   returns real committees for `P` (e.g. a presidential-committee shell), `A`, `J`
   (10,000 Lakes Victory), `D`, and `U` (ActBlue).
6. **`ScheduleABySize.total` excludes memo rows too — no asymmetry.** Same empirical
   check as item 1: the by_size bucket's `total` matched the non-memo sum exactly and
   excluded the memo row. The asymmetry the primer worried about doesn't exist in
   practice — `by_size` just doesn't *surface* a separate memo figure the way
   `by_purpose` does, but its `total` is memo-safe the same way.
7. **Aggregate endpoint paths — confirmed from OpenFEC's `webservices/resources/aggregates.py`
   comments and live calls**: `/schedules/schedule_a/by_employer/`, `by_occupation/`,
   `by_size/`, `by_state/`, `by_zip/`; `/schedules/schedule_b/by_purpose/`,
   `by_recipient/`, `by_recipient_id/`; `/schedules/schedule_e/by_candidate/`;
   `/communication_costs/by_candidate/`; `/electioneering/by_candidate/`. Also
   confirmed `/schedules/schedule_f/` (Schedule F, party coordinated expenditures, per
   §16's 2026 addition) live for Kamala Harris — 109 records for the 2024 cycle.
8. **`/efile/` paths confirmed from `webservices/resources/sched_a.py`/`sched_b.py`/
   `sched_e.py`/`sched_h4.py` and a live call**: `/schedules/schedule_a/efile/`,
   `/schedules/schedule_b/efile/`, `/schedules/schedule_e/efile/`,
   `/schedules/schedule_h4/efile/`. Live-called `schedule_a/efile/` for Ossoff's
   committee — works, distinct field set from the regular Schedule A endpoint
   (`contributor_aggregate_ytd` present, no `line_number_label`).

### A ninth finding, not on the original checklist

**`most_recent=true` on `/committee/{id}/reports/` does not filter server-side.**
Discovered while capturing the F3P fixture: querying Kamala Harris's 2020 committee
with `most_recent=true` for a single reporting period returned every historical
amendment of that report, each still carrying its own correct `most_recent` boolean —
the *parameter* just didn't reduce the result set at all. Fixed in
`committeeReports.ts`: results are now filtered client-side on `most_recent !== false`
whenever the caller leaves `is_amended` unset (the case that's supposed to mean "just
give me the current version of each report"). This matters for Phase 1's report-to-report
diffing, which depends on getting exactly one row per period.

---

## 4. Sources

- OpenFEC source, read via `raw.githubusercontent.com/fecgov/openFEC/develop/`:
  `webservices/common/models/reports.py`, `webservices/common/models/itemized.py`,
  `webservices/common/models/aggregates.py`, `webservices/docs.py`
- *NRSC v. FEC*, 609 U.S. ___ (2026), decided June 30, 2026:
  FEC's notice — `https://www.fec.gov/updates/supreme-court-finds-limits-on-coordinated-party-expenditures-unconstitutional-in-nrsc-v-fec-609-us-____2026/`;
  opinion — `https://www.supremecourt.gov/opinions/25pdf/24-621_h315.pdf`;
  analysis — `https://www.skadden.com/insights/publications/2026/07/nrsc-v-fec`
