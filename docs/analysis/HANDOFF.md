# Handoff: report-analysis work, as of 2026-08-31

Written at the end of a Claude Code web session so a local CLI session can pick this up
cold. Branch: `claude/mcp-server-missing-objects-1bfahy`.

## What happened in the previous session

1. Audited the server for missing OpenFEC objects (15 tools registered, several whole
   data categories unwrapped).
2. Researched compliance-style report review → `docs/research/2026-08-31-analyzing-an-fec-report.md`
3. Researched journalistic analysis → `docs/research/2026-08-31-journalistic-analysis-of-fec-filings.md`
4. Added the analytical framework this work implements → `docs/analysis/fec-report-analysis-primer.md`
   (authored by Louis Levine; section numbers are stable and referenced elsewhere)
5. Mapped that framework onto OpenFEC field by field → `docs/analysis/implementing-the-primer.md`

**Read `implementing-the-primer.md` first.** It's the actionable one. The two research
notes are background.

## The critical constraint that no longer applies

The web session ran behind an egress proxy that blocked **both `www.fec.gov` and
`api.open.fec.gov`**. So:

- No field name in these docs was verified against a live API response. They were read
  out of OpenFEC's source models on `raw.githubusercontent.com`, which is authoritative
  for what the API *defines* but not for what a given committee's response *populates*.
- Every FEC primary source (RAD procedures, Form 3/3X instructions, materiality
  thresholds, contribution limits chart) was found by search but never read directly.

**A local CLI session has network access. Resolving the verification checklist is
therefore the single highest-value first move**, and it unblocks writing code against
real response shapes instead of inferred ones.

## Do this first: the verification checklist

From `implementing-the-primer.md` §3, ordered by how much depends on each. Needs
`FEC_API_KEY` set.

1. **`memo_code === 'X'`** actually marks memo rows on live Schedule A/B responses, and
   `non_memo_total` on the Schedule B aggregates excludes them. *Most load-bearing item
   in the whole plan* — the primer's §5/§7/§20 double-counting rules depend on it.
2. **F3 `_ytd` fields** — do they carry election-cycle-to-date (matching Form 3's
   Column B) or calendar-year-to-date? Silent wrong-number risk.
3. **`receipt_type` / `disbursement_type` codes for in-kind** — currently blocks primer
   §12 entirely.
4. **`disbursement_purpose_category` value list** — enumerate empirically; not
   documented. Needed for primer §6.
5. **Committee `designation` codes** — confirm `P`/`A`/`J`/`D`/`U`. Needed for §1/§16
   ecosystem discovery.
6. **Whether `ScheduleABySize.total` includes memo rows** — it's `total`, not
   `non_memo_total`, unlike the Schedule B aggregates. Asymmetry worth checking.
7. **Exact aggregate endpoint URL paths** — models confirmed in `aggregates.py`, paths
   not (`rest.py` doesn't declare them; they live in `webservices/resources/`).
8. **`/efile/` endpoint paths and response shapes.**

While doing this, **capture one real `/committee/{id}/reports/` response per form type
(F3, F3P, F3X) and commit them as test fixtures.** The repo's existing practice — see
`FEC_MCP_NOTES.md`, which records two cases where the obvious parameter name was wrong
and only live testing caught it — says don't skip this.

## Then: build Phase 1

`fec_filing_review`, implementing steps 1, 2, 3 and 6 of the primer's 15-minute review,
plus the §15 primary-timing guard. **Needs no new endpoints** — it's arithmetic over
`/committee/{id}/reports/` plus already-wrapped tools, fully unit-testable against
fixtures with no network.

Covers primer §1, §2, §3, §9, §10, §11, §14, and most of §18.

Two design decisions already made and worth preserving:

- **Step 8 ("write the story in one sentence") is deliberately not computed.** The tool
  returns the change table, metrics, flagged leads and caveats; the model calling it
  does the synthesis. Deterministic arithmetic in TypeScript, narrative judgment in the
  model.
- **The §3 fundraising-receipts formula is ours, not FEC's** (no "adjusted" field
  exists in the reports models). Output must label it as ours and show its components.

Phase 2 (wrap the `by_*` aggregates, then primer §4/§6/§16) and Phase 3
(paging-dependent: top-10 donors, timing curves, memo drill-down) are specced in
`implementing-the-primer.md` §2.

## Open question for the user

Screening across many committees ("every committee whose fundraising share exceeds
50%") is high value for journalism but a poor fit for a live-API-per-call server. It may
belong in the separate `FECDownload` bulk project the README references, with this
server handling drill-down. Unresolved.

## Suggested opening prompt for the CLI session

> Read docs/analysis/HANDOFF.md, then docs/analysis/implementing-the-primer.md. We have
> live API access now — work the verification checklist and commit the fixtures, then
> build Phase 1.
