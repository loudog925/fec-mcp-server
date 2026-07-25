#!/usr/bin/env node
// Manual smoke test against the LIVE FEC API. Not part of `npm test` (which
// mocks fetch and needs no network/API key) — this script exercises the real
// endpoints to catch upstream param/shape drift the mocked unit tests can't.
//
// Usage:
//   npm run build
//   node --use-system-ca scripts/smoke-test.mjs
//
// Requires FEC_API_KEY in .env or the environment. Prints PASS/FAIL per step;
// exits non-zero if anything fails.

import "dotenv/config";
import { candidateSearch } from "../dist/tools/candidates.js";
import { committeeSearch } from "../dist/tools/committees.js";
import { itemizedContributions } from "../dist/tools/contributions.js";
import { elections } from "../dist/tools/elections.js";
import { calendar } from "../dist/tools/calendar.js";
import { legalSearch } from "../dist/tools/legal.js";

let failures = 0;

function log(step, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${step}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    log(name, false, err.message);
  }
}

// DNC Services Corp / Democratic National Committee — a stable, real,
// high-volume committee ID, confirmed live (GET /committee/C00010603/).
// Full-text committee name search is unreliable for picking a specific
// committee (e.g. "Democratic National Committee" can match an unrelated
// same-named committee from decades ago), so this is hardcoded rather than
// looked up, to keep the keyset-pagination check deterministic.
const DNC_COMMITTEE_ID = "C00010603";

async function main() {
  console.log(`Using FEC_API_KEY=${(process.env.FEC_API_KEY ?? "").slice(0, 6)}...\n`);

  let candidateId;

  await step("fec_candidate_search: find a well-known candidate", async () => {
    const raw = await candidateSearch({ q: "Biden", office: "P", cycle: [2024] });
    const data = JSON.parse(raw);
    candidateId = data.results?.[0]?.candidate_id;
    log(
      "fec_candidate_search",
      Boolean(candidateId),
      `found candidate_id=${candidateId ?? "none"}`
    );
  });

  await step("fec_committee_search: text search returns a result (name matching may be loose)", async () => {
    const raw = await committeeSearch({ q: "Democratic National Committee" });
    const data = JSON.parse(raw);
    log(
      "fec_committee_search",
      Boolean(data.results?.[0]?.committee_id),
      `found committee_id=${data.results?.[0]?.committee_id ?? "none"} name=${data.results?.[0]?.name ?? "none"}`
    );
  });

  await step("fec_itemized_contributions + keyset pagination", async () => {
    // Narrowed to a 2-day window on a known-busy committee — unnarrowed
    // Schedule A queries on high-volume committees can time out upstream.
    const page1Raw = await itemizedContributions({
      committee_id: [DNC_COMMITTEE_ID],
      per_page: 5,
      min_date: "2024-10-01",
      max_date: "2024-10-02",
    });
    const page1 = JSON.parse(page1Raw);
    const lastIndexes = page1.pagination?.last_indexes;
    log(
      "page 1 has pagination.last_indexes",
      Boolean(lastIndexes?.last_index),
      JSON.stringify(lastIndexes)
    );
    if (!lastIndexes?.last_index) return;

    const page2Raw = await itemizedContributions({
      committee_id: [DNC_COMMITTEE_ID],
      per_page: 5,
      min_date: "2024-10-01",
      max_date: "2024-10-02",
      last_index: String(lastIndexes.last_index),
      last_contribution_receipt_date: lastIndexes.last_contribution_receipt_date,
    });
    const page2 = JSON.parse(page2Raw);
    const firstIdsDiffer =
      JSON.stringify(page1.results?.[0]) !== JSON.stringify(page2.results?.[0]);
    log(
      "keyset page 2 returns different results than page 1",
      firstIdsDiffer && !page2.error,
      `page2 first result id=${page2.results?.[0]?.sub_id ?? "n/a"}`
    );
  });

  await step("fec_elections: search mode (House, OH-07, 2024)", async () => {
    const raw = await elections({ office: "H", cycle: 2024, state: "OH", district: "07" });
    const data = JSON.parse(raw);
    log("fec_elections search", Array.isArray(data.results), `${data.results?.length ?? 0} candidate(s)`);
  });

  await step("fec_elections: zip-based search", async () => {
    const raw = await elections({ office: "H", cycle: 2024, zip: "43210" });
    const data = JSON.parse(raw);
    log("fec_elections zip search", Array.isArray(data.results), `${data.results?.length ?? 0} result(s)`);
  });

  await step("fec_elections: summary mode (President, 2024)", async () => {
    const raw = await elections({ office: "P", cycle: 2024, mode: "summary" });
    const data = JSON.parse(raw);
    log("fec_elections summary", !data.error, JSON.stringify(data).slice(0, 200));
  });

  await step("fec_calendar: events mode", async () => {
    const raw = await calendar({
      min_date: "2026-01-01",
      max_date: "2026-12-31",
      category: "21",
    });
    const data = JSON.parse(raw);
    log("fec_calendar events", Array.isArray(data.results), `${data.results?.length ?? 0} event(s)`);
  });

  await step("fec_calendar: filing_deadlines mode", async () => {
    const raw = await calendar({ mode: "filing_deadlines", report_year: 2026 });
    const data = JSON.parse(raw);
    log(
      "fec_calendar filing_deadlines",
      Array.isArray(data.results),
      `${data.results?.length ?? 0} deadline(s)`
    );
  });

  await step("fec_calendar: election_dates mode", async () => {
    const raw = await calendar({
      mode: "election_dates",
      state: "OH",
      office: "H",
      election_year: 2026,
    });
    const data = JSON.parse(raw);
    log(
      "fec_calendar election_dates",
      Array.isArray(data.results),
      `${data.results?.length ?? 0} date(s)`
    );
  });

  await step("fec_legal_search: advisory opinions query", async () => {
    const raw = await legalSearch({ query: "coordinated party expenditure", type: "advisory_opinions" });
    const data = JSON.parse(raw);
    log("fec_legal_search", Array.isArray(data.results), `${data.results?.length ?? 0} document(s)`);
  });

  console.log(`\n${failures === 0 ? "All steps passed." : `${failures} step(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
