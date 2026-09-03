# Research: Journalistic Analysis of FEC Filings

Compiled 2026-08-31. Companion to `2026-08-31-analyzing-an-fec-report.md`, which
covered compliance-style review. This one covers how reporters and watchdogs actually
work a filing to find a story.

**Research constraint:** `www.fec.gov`, `api.open.fec.gov`, and several other domains
were blocked by the network egress proxy in this environment. Sources were reachable
through search summaries but most could not be fetched and read in full, and no API
field name here was verified live. Sources listed in section 6.

---

## 1. The core difference from compliance analysis

Compliance review asks: *is this report internally consistent?* It's a single-report,
self-contained question, and the answer is arithmetic.

Journalism asks: *is this number unusual, and who is behind it?* That's a different
shape of problem in two ways that matter enormously for tooling:

1. **It is inherently comparative.** A $2.1M quarter means nothing alone. It means
   something against the opponent's quarter, against last quarter, against the same
   seat in the last cycle, against what a competitive race in that state costs. A tool
   that returns one committee's numbers has not done journalism; it has done data
   retrieval.
2. **It is entity-resolution heavy.** Almost every real story turns on establishing
   that two names are the same person, or that a payee is connected to the candidate,
   or that an LLC donor has no business behind it. The FEC gives you strings, not
   entities, and the gap between those is where both the stories and the errors live.

This server is currently built almost entirely for single-entity lookup. That's the
right foundation, but it's the *comparison* and *rollup* layers that journalism needs
and that are missing.

---

## 2. Story archetypes and their data signals

Organized by family. For each: the story, the signal, and — importantly — the
disconfirming check, because the fastest way to embarrass yourself with FEC data is to
publish the first pattern you find.

### Family A — The topline story

**A1. The quarter story.** The routine one, filed within hours of the deadline.
Raised, spent, cash on hand, versus opponents and versus the prior quarter. NICAR
session material notes that most news stories stop at exactly this summarization —
which is precisely why going one layer deeper is where the differentiated work is.
- *Signal:* summary-page lines, all available in one `/committee/{id}/reports/` call.
- *Disconfirm:* check whether the filing is an amendment, and whether the period is a
  quarterly or a shorter pre-election window — comparing a 12-day pre-primary report
  to a full quarter is a classic unforced error.

**A2. The campaign in trouble.** Burn rate over 1.0, cash on hand falling, debts
rising, refunds climbing, payroll shrinking.
- *Signal:* disbursements ÷ receipts; COH trend across reports; `debts_owed_by_committee`
  trend; operating expenditures with payroll-type purposes declining.
- *Disconfirm:* burn rate is expected to exceed 1.0 immediately before an election —
  that's the point of raising money. High burn in Q1 of an off-year is a story; high
  burn in the pre-general is not.

**A3. Net cash, not headline cash.** COH minus debts owed. Campaigns tout cash on hand;
the debt line is on the same page and frequently changes the picture.

### Family B — The spending story ("where the money goes")

**B1. Vendor concentration and self-dealing.** Who gets paid, how much, and are they
connected to the candidate? Payments to a firm owned by the campaign manager, to the
candidate's own business, rent paid to a property the candidate owns.
- *Signal:* Schedule B rolled up by payee; fuzzy match of payee names against the
  candidate's surname, the treasurer, and known committee addresses.
- *Disconfirm:* pass-through payments. A $400k payment to a media buyer is not $400k
  of "consulting" — most of it is ad time being bought on the campaign's behalf. FEC
  data does not show subvendors. This single misreading produces a lot of bad copy.

**B2. Paying the family.** Documented as an active story vein: a recent watchdog
complaint alleged a Senate candidate steered funds to nearly half a dozen relatives,
including roughly a quarter-million dollars to a spouse, across a campaign committee
and several PACs.
- *Signal:* Schedule B payees sharing the candidate's surname; salary-type purposes.
- *Important nuance:* **paying family is not illegal.** The FEC's rule is fair market
  value for bona fide services; salary above FMV is personal use. Ethics experts note
  the difficulty is that with relatives there's an incentive to overpay or pay for
  unneeded work. So the story is about amount and role, not the existence of payment.
- *Disconfirm:* common surnames. And check whether the person has a genuine documented
  role before implying otherwise.

**B3. Personal use / lifestyle spending.** Resorts, country club dues, luxury retail,
airline tickets, limo trips, cell phone bills, rent — the categories the Tampa Bay
Times/WTSP zombie-campaign investigation surfaced.
- *Signal:* Schedule B purpose strings and payee names matched against consumer-brand
  and hospitality patterns.
- *Disconfirm:* campaign travel and events legitimately produce hotel, airline and
  catering charges. Context (is the candidate actually campaigning?) is what separates
  the two, and that context is usually *not* in the data.

**B4. Zombie campaigns.** Committees still spending long after the candidate left
office — the Times/WTSP investigation found more than 100 former politicians still
spending, 20 of them active for over a decade, and eight still spending after the
candidate had died. The FEC ultimately demanded explanations from about 50.
- *Signal:* a committee with ongoing operating expenditures, no candidate activity, no
  recent election, years past the last campaign. Needs committee status flags
  (`is_active`, `cycles_has_activity`, `last_cycle_has_activity` — which
  `FEC_MCP_NOTES.md` §6 notes already ride along in cross-committee loan/debt results)
  combined with recent Schedule B activity.
- *Disconfirm:* legitimate wind-down (paying off debts, final compliance/legal costs,
  refunding donors) looks similar for a period. Duration and spending *category* are
  what distinguish it.

**B5. Scam PACs.** The most quantifiable archetype in this entire document, which is
what makes it the best automation target.
- *Signal — published criteria:* OpenSecrets identified scam PACs using two tests:
  spent over **$100,000** and at least **50% of itemized expenditures classified as
  fundraising**. A CFPI analysis found about **71% of the $344.3 million** spent by 61
  scam PACs since 2001 went to fundraising, wages and administrative expenses;
  typically **80–90%** goes to overhead, and in egregious cases as much as **99%**.
  The mirror-image metric is what share went *out* as contributions to candidates —
  often near zero.
- *Also:* operators frequently have personal ties to the vendors receiving the money,
  so the payee rollup is where it gets confirmed.
- *Disconfirm:* a genuinely new PAC has high startup fundraising costs. And some
  legitimate committees are advocacy shops that never give to candidates by design —
  low candidate-contribution share isn't damning on its own, it's the combination with
  self-dealing vendors and donor-deceiving branding.

### Family C — The money-source story

**C1. Shell company / straw donor.** CLC's published markers are unusually concrete:
an LLC that exists only on paper with **no storefront, website, or social media
presence**, **incorporated shortly before its first contribution** (one case: organized
in Delaware **10 days** before), **no commercial activity** capable of generating the
money, making **large contributions to multiple super PACs** months after creation.
Cases have involved $1.4M, $2.5M+, and $2.6M.
- *Signal in FEC data alone:* a corporate-form contributor name appearing for the first
  time, giving large amounts, with a thin or shared address. FEC data gets you the
  candidate list; corporate registry lookups do the confirming, and those are outside
  this server's scope.
- *Disconfirm:* plenty of real businesses give through an LLC. Absence of a website is
  suggestive, not probative.

**C2. Retired / unemployed maxed donors.** A donor listing "retired" or "unemployed"
who maxes out repeatedly is a classic straw-donor marker, and also connects to the
elderly-donor-exploitation reporting vein.
- *Disconfirm:* wealthy retirees are a large and entirely legitimate donor class. This
  is a sorting heuristic for where to look, never a finding.

**C3. Single-donor and pop-up super PACs.** A committee registered recently, funded by
one or a few donors, immediately spending on independent expenditures.
- *Signal:* committee first-file date close to first contribution date; donor
  concentration; IE activity. Needs committee registration history.

**C4. Industry and lobbyist clustering.** Contributions grouped by employer and
occupation to show which industry is backing whom. The FEC requires employer and
occupation on contributions aggregating over **$200**, and its own interface supports
searching contributions by employer — e.g. all contributions to a committee from
donors listing the same employer.
- *Disconfirm:* employer and occupation are **self-reported and frequently junk** —
  blank, "self," "information requested," inconsistent spellings of the same firm.
  Any employer rollup needs normalization and an explicit statement of how much of the
  total was unclassifiable.

**C5. Small-dollar reliance and its decline.** Unitemized ÷ total individual, tracked
across quarters. Rising small-dollar share is a grassroots-energy story; falling share
across a cycle is a list-fatigue story.
- *Disconfirm:* per OpenSecrets' own caveat, the unitemized line is **dollars, not
  donors**. It supports "X% of money came in gifts under $200," never "X% of donors
  are small donors."

**C6. Out-of-state money.** Share of itemized contributions from outside the state —
the carpetbagger/nationalized-race frame.

**C7. Conduit and joint-fundraising flows.** ActBlue and WinRed are conduits: they
receive an earmarked contribution, take a fee (WinRed's is currently **3.94%**), and
pass the rest through. FEC rules require the intermediary to report the original source
and the intended recipient, *and* the recipient committee to report it attributed to
the original individual.
- *Critical caveat, and the most common data error in this whole area:* this means the
  same dollar is **reported multiple times as it moves through the system**, which can
  make donation activity look abnormally inflated. Any tool that sums naively across
  conduits, JFCs and recipient committees will produce a wrong and much-too-large
  number. Analysts have publicly had to debunk "irregularity" claims that were nothing
  but this double-counting.

### Family D — The network story

**D1. Coordination by common vendor.** Super PACs hiring the same media and consulting
firms as the candidates they support — allowing strategy alignment without triggering
contribution limits. Documented instances include the NRA sharing media and consulting
firms with the Trump campaign in 2016, and an FEC investigation into Kerry and America
Coming Together over the common vendor Dewey Square Group. OpenSecrets found
candidate/super PAC vendor sharing rising over time.
- *Signal:* intersect the Schedule B payee sets of a campaign and the super PAC
  supporting it. This is a straightforward set operation on data the server already
  reaches.
- *Essential framing caveat:* the FEC's coordination test is rarely enforced —
  commissioner deadlock means the vast majority of coordination complaints go nowhere,
  and reportedly **no coordination investigation has ever resulted in a PAC being
  fined**. Firewalls are a recognized compliance practice. So shared vendors are a
  legitimate, reportable *fact pattern*, and are not evidence of illegality.

**D2. The compliance-firm map.** Already the strongest material in this repo —
`FEC_MCP_NOTES.md` §4, §5, §7 on treasurer/designated-agent rosters, identifying firms
by committee email domain, and cross-committee creditor tracing.

**D3. Donors giving to both sides.** A contributor appearing on both candidates'
Schedule A, or to an incumbent and their challenger.

### Family E — The timing story

**E1. Money in, action out.** Contributions clustered before a vote, a contract award,
an appointment.
- *Disconfirm:* this is the archetype most likely to be spurious. Fundraising clusters
  around quarter-end deadlines for reasons that have nothing to do with legislation,
  and correlation with a vote is not evidence of exchange. Needs external reporting to
  stand up.

**E2. Deadline-night filings.** The scramble the night a report is due. Worth flagging
because it has a hard tooling implication — see section 4.

**E3. Amendments that change the story.** An amended report that removes a
contribution, restates cash on hand, or re-describes a disbursement's purpose. The
*diff between original and amendment* is itself the story.
- *Signal:* compare original vs. amended filings for the same period. Nothing in the
  server does this today.

---

## 3. The craft rules — how not to be wrong

Distilled from the caveats above, because these should be encoded in tool output, not
just documented:

1. **Never a number without a benchmark.** Any single figure should be emitted
   alongside its comparison set: prior period, opponent, prior cycle.
2. **A payee is not an ultimate recipient.** Media buyers and pass-through vendors
   hide subvendors. Never characterize a payment as spending "on" the payee's apparent
   category.
3. **Names are strings, not identities.** Fuzzy matching finds candidates for
   reporting; it never establishes identity. Every matched pair needs a human check.
4. **Employer and occupation are self-reported junk at meaningful rates.** Report the
   unclassifiable share whenever you report an employer rollup.
5. **Conduits and JFCs double-count.** Know which layer of the pipe you're summing.
6. **Unitemized is dollars, not donors.**
7. **Amendments supersede.** Every output needs an as-of date and an amendment status.
8. **Processed data lags.** Absence of a filing near a deadline usually means
   processing lag, not non-filing.
9. **Scale matters.** A $600 payment to a relative is not a story. Thresholds should be
   proportionate to the committee's size.
10. **Legal ≠ newsworthy, and newsworthy ≠ illegal.** Paying family, sharing vendors,
    and LLC contributions are all lawful in the ordinary case. The tool's vocabulary
    should be "notable / worth checking," never "violation."
11. **The data ends where the story begins.** Every one of these archetypes is
    completed by a corporate registry lookup, a property record, or a phone call. The
    most useful thing a tool can output alongside a finding is *what to check next*.

---

## 4. What this implies for the server

### 4.1 The capability gap is rollup and comparison, not access

Schedule A and B rows are already reachable. What no tool does is **aggregate them**.
Every Family B and C story above is a group-by:

- payee → total (vendor concentration, self-dealing, scam PAC ratio)
- purpose category → total (fundraising share, lifestyle spending)
- employer / occupation → total (industry clustering)
- contributor state → total (out-of-state share)
- contribution size band → total (small-dollar profile)

Doing these client-side means paging tens of thousands of rows per committee. OpenFEC
has purpose-built aggregate endpoints for exactly this — `schedule_a/by_size`,
`by_state`, `by_employer`, `by_occupation`, `by_zip`, and `schedule_b/by_purpose`,
`by_recipient` — and **none of them are wrapped**. They were listed as gap #6 in the
prior gap analysis; from a journalism standpoint they move to the top of the list,
because they convert an impractical query into one call.

### 4.2 The other blockers, ranked for this use case

1. **`/efile/` endpoints** — reporters work deadline night. Processed data trails raw
   electronic filings by days, so the server is structurally unable to help during the
   exact window when the reporting happens. This is the single biggest journalism gap.
2. **The `by_*` aggregates** — as above.
3. **`/schedules/schedule_e/by_candidate/`** — who is spending for and against whom,
   the standard measure of where a race is being contested.
4. **`/electioneering/` and `/communication-costs/`** — outside-spending completeness.
5. **Committee `/history/`** — name and treasurer changes; feeds pop-up PAC and zombie
   detection.
6. **Original-vs-amendment comparison** — no endpoint gap here, just unbuilt logic.

### 4.3 Proposed tools

**Phase 1 — `fec_committee_profile`.** The quarter story in one call, with benchmarks
built in: topline, trend across the last N reports, burn rate, runway, net cash, source
mix, small-dollar share, plus race context pulled from `/elections/`. Deterministic
arithmetic over `/committee/{id}/reports/`. No new endpoints required.

**Phase 2 — the rollup tools**, built on the aggregate endpoints once wrapped:
- `fec_spending_profile` — Schedule B by payee and purpose. Produces vendor
  concentration, the fundraising-share ratio (with the OpenSecrets >$100k / ≥50%
  screen as a named, cited threshold), and surname/address matches against the
  candidate and treasurer.
- `fec_donor_profile` — Schedule A by size band, employer, occupation, state. Produces
  small-dollar share, industry clustering, out-of-state share — each reported with its
  unclassifiable share.

**Phase 3 — the network tools:**
- `fec_shared_vendors` — intersect payee sets between two or more committees. Small to
  build, and it's the direct mechanism behind the common-vendor archetype.
- `fec_report_diff` — original vs. amended, surfacing what changed.

**Cross-cutting, and the part I'd argue matters most:** every output carries an as-of
date, amendment status, a `caveats` array populated from the section 3 rules that apply
to the specific figures returned, and a `next_checks` array naming the outside sources
that would confirm the pattern. A journalism tool that returns a suggestive number
without the caveat attached is worse than no tool, because the caveat is exactly what
gets dropped under deadline.

---

## 5. Open questions for scoping

1. **Who's the user?** A reporter on deadline (wants the quarter story in one call, and
   needs `/efile/`) and an investigative reporter on a two-week project (wants rollups
   and network tools) want almost disjoint feature sets.
2. **Screening across many committees** — "show me every committee whose fundraising
   share exceeds 50%" — is the highest-value journalism capability and the worst fit
   for a live-API-per-call server. That's arguably a job for the separate `FECDownload`
   bulk project the README points at, with this server handling the drill-down.
3. **How opinionated should output be?** A `flags` array is more useful and more
   dangerous than raw metrics. My inclination: emit metrics plus explicitly-labeled,
   citation-carrying screens (the OpenSecrets criteria, the CLC shell-company markers),
   never an unattributed judgment.

---

## 6. Sources

- NICAR/Knight Lab on tackling federal campaign finance data: `https://knightlab.northwestern.edu/2016/03/13/nicar16-tackling-federal-election-campaign-finance-data`
- IRE tipsheets (FEC): `https://www.ire.org/resource-center/tipsheets/?q=FEC`
- Journalist's Resource, writing about campaign finance: `https://journalistsresource.org/politics-and-government/writing-campaign-finance-tip-sheet-tools-examples/`
- FEC, how to research public records: `https://www.fec.gov/introduction-campaign-finance/how-to-research-public-records/`
  and individual contribution research: `https://www.fec.gov/introduction-campaign-finance/how-to-research-public-records/individual-contributions/`
- OpenSecrets on scam PACs: `https://www.opensecrets.org/news/2023/08/how-scam-pacs-line-their-pockets-by-deceiving-political-donors/`
- CharityWatch on scam PACs: `https://blog.charitywatch.org/scam-pacs-are-on-the-rise-dont-confuse-them-for-legitimate-charities-2/`
- Tampa Bay Times / WTSP "Zombie Campaigns": `https://projects.tampabay.com/projects/2018/investigations/zombie-campaigns/spending-millions-after-office/`
  and the FEC's response: `https://www.tampabay.com/investigations/2019/05/30/fec-to-mitt-romney-michele-bachmann-and-48-more-zombie-campaigns-why-are-you-still-here/`
- CLC on straw donor schemes: `https://campaignlegal.org/update/what-are-straw-donor-schemes-and-why-are-they-problem`
  and shell-company markers: `https://campaignlegal.org/update/straw-donor-scheme-funnels-over-25-million-six-federal-committees`
- OpenSecrets on a shell company steering $2.6M: `https://www.opensecrets.org/news/2024/05/shell-company-steering-millions-to-republican-pacs-raises-concerns-of-illicit-funding-sch/`
- OpenSecrets on candidate/super PAC shared vendors: `https://www.opensecrets.org/news/2016/12/candidates-super-pacs-share-vendors/`
- Northwestern JLSP on the common vendor loophole: `https://scholarlycommons.law.northwestern.edu/cgi/viewcontent.cgi?article=1235&context=njlsp`
- Sludge on FEC coordination enforcement: `https://readsludge.com/2024/09/06/fec-guts-anti-corruption-law-that-separates-super-pacs-and-candidates/`
- FEC on personal use: `https://www.fec.gov/help-candidates-and-committees/making-disbursements/personal-use/`
- Aristotle on conduit/earmarked reporting mechanics: `https://aristotle.helpspot.com/portals/cm/index.php?pg=kb.page&id=974`
- Maryland Matters on conduit double-counting being mistaken for irregularities: `https://marylandmatters.org/2023/06/20/expert-claims-of-campaign-finance-irregularities-are-dubious/`
- OpenSecrets donor lookup and methodology: `https://www.opensecrets.org/donor-lookup`, `https://www.opensecrets.org/campaign-expenditures/methodology`
