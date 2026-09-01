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

**Phase 1 — steps 1, 2, 3, 6 and the §15 period guard.** Needs *no new endpoints*.
Delivers §1, §2, §3, §9, §10, §11, §14, §18 (minus top-10), and the primer's core
principle. This is arithmetic over one `/committee/{id}/reports/` response plus already
wrapped tools, and it's fully unit-testable against fixtures with no network.

**Phase 2 — wrap the aggregates**, then steps 4, 5 and 7. Unlocks §4's clustering, §6's
categories, §16's outside spending. This is where most remaining primer value sits.

**Phase 3 — the paging-dependent pieces:** top-10 donors (§18), timing curves (§13),
memo drill-down (§7).

**Deferred pending resolution:** §12 in-kind exclusion, blocked on the receipt_type
code list.

---

## 3. Verification checklist before writing code

Ordered by how much depends on it:

1. **`memo_code === 'X'`** actually marks memo rows in live Schedule A/B responses, and
   `non_memo_total` on the Schedule B aggregates excludes them as expected.
2. **F3 `_ytd` fields** — cycle-to-date or calendar-year-to-date? (§2)
3. **`receipt_type` / `disbursement_type` codes for in-kind.** (§12)
4. **`disbursement_purpose_category` value list**, enumerated from live data. (§6)
5. **Committee `designation` codes** — confirm `P`/`A`/`J`/`D`/`U`. (§1, §16)
6. **Whether `ScheduleABySize.total` includes memo rows** — it's `total`, not
   `non_memo_total`, unlike the Schedule B aggregates. Asymmetry worth checking.
7. **Exact aggregate endpoint paths** — the models are confirmed in `aggregates.py`;
   the URL paths were not (`rest.py` doesn't declare them; they're in
   `webservices/resources/`).
8. **`/efile/` endpoint paths and response shapes.** (§17)

Capture one real reports response per form type (F3, F3P, F3X) as committed fixtures
while doing this.

---

## 4. Sources

- OpenFEC source, read via `raw.githubusercontent.com/fecgov/openFEC/develop/`:
  `webservices/common/models/reports.py`, `webservices/common/models/itemized.py`,
  `webservices/common/models/aggregates.py`, `webservices/docs.py`
- *NRSC v. FEC*, 609 U.S. ___ (2026), decided June 30, 2026:
  FEC's notice — `https://www.fec.gov/updates/supreme-court-finds-limits-on-coordinated-party-expenditures-unconstitutional-in-nrsc-v-fec-609-us-____2026/`;
  opinion — `https://www.supremecourt.gov/opinions/25pdf/24-621_h315.pdf`;
  analysis — `https://www.skadden.com/insights/publications/2026/07/nrsc-v-fec`
