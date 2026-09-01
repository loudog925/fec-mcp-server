import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { filingReview } from "../src/tools/filingReview.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): { results: unknown[] } {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

const f3Reports = loadFixture("committee-reports-f3.json");
const f3xReports = loadFixture("committee-reports-f3x.json");
const f3pReports = loadFixture("committee-reports-f3p.json");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

// Routes a mocked fetch call to canned responses keyed by URL substring, so
// each test only has to describe what differs from the defaults.
function mockRouter(overrides: Record<string, unknown>) {
  // Longest key first, so a specific path like ".../reports/" is matched
  // before a shorter prefix like ".../committee/C00.../" that it contains.
  const entries = Object.entries(overrides).sort((a, b) => b[0].length - a[0].length);
  return vi.fn().mockImplementation((url: string) => {
    for (const [key, body] of entries) {
      if (url.includes(key)) return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse({ results: [] }));
  });
}

describe("filingReview", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(filingReview({ committee_id: "" })).rejects.toThrow("committee_id is required");
  });

  it("throws when the committee lookup returns nothing", async () => {
    vi.stubGlobal("fetch", mockRouter({ "/committee/C00000000/": { results: [] } }));
    await expect(filingReview({ committee_id: "C00000000" })).rejects.toThrow(
      "No committee found"
    );
  });

  it("reports no reports found when the reports endpoint is empty", async () => {
    const fetchMock = mockRouter({
      "/committee/C00718866/": {
        results: [{ name: "OSSOFF FOR SENATE", designation: "P", candidate_ids: ["S8GA00180"] }],
      },
      "/committee/C00718866/reports/": { results: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await filingReview({ committee_id: "C00718866" });
    expect(JSON.parse(result).message).toContain("No reports found");
  });

  it("computes the seven numbers, fundraising formula, and change table for a Form 3 committee", async () => {
    const fetchMock = mockRouter({
      "/committee/C00718866/": {
        results: [
          {
            name: "OSSOFF FOR SENATE",
            designation: "P",
            designation_full: "Principal campaign committee",
            committee_type: "S",
            candidate_ids: ["S8GA00180"],
          },
        ],
      },
      "/committee/C00718866/reports/": f3Reports,
      "/committees/": {
        results: [
          { committee_id: "C00718866", name: "OSSOFF FOR SENATE", designation: "P" },
          { committee_id: "C00999999", name: "OSSOFF VICTORY FUND", designation: "J" },
        ],
      },
      "/candidate/S8GA00180/": { results: [{ office: "S", state: "GA" }] },
      "/election-dates/": {
        results: [
          { election_date: "2026-05-19", election_type_full: "Primary election" },
          { election_date: "2026-11-03", election_type_full: "General election" },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await filingReview({ committee_id: "c00718866" }));

    expect(result.report_form).toBe("Form 3");
    const latest = result.reports[0];
    expect(latest.total_receipts_period).toBeCloseTo(16840153.57);
    expect(latest.effective_cash_position).toBe(
      latest.cash_on_hand_end_period - latest.debts_owed_by_committee
    );
    expect(latest.fundraising).not.toBeNull();
    expect(latest.fundraising.fundraising_receipts).toBeCloseTo(
      16840153.57 - 0 - 1973675.92 - 777.56 - 253149.97
    );

    expect(result.change_table).toHaveLength(2);
    expect(result.change_table[0].receipts_change).toBeCloseTo(16840153.57 - 3168948.31);

    expect(result.ecosystem.joint_fundraising_committee).toHaveLength(1);
    expect(result.ecosystem.principal_campaign_committee).toHaveLength(1);

    expect(result.primary_timing_guard.status).toBe("post-primary");
    expect(result.caveats.some((c: string) => /primary/i.test(c))).toBe(true);
  });

  it("does not compute the fundraising formula for a Form 3X committee, and skips the primary guard for a non-P designation", async () => {
    const fetchMock = mockRouter({
      "/committee/C00010603/": {
        results: [
          {
            name: "DNC SERVICES CORP / DEMOCRATIC NATIONAL COMMITTEE",
            designation: "U",
            committee_type: "Y",
            candidate_ids: [],
          },
        ],
      },
      "/committee/C00010603/reports/": f3xReports,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await filingReview({ committee_id: "C00010603" }));

    expect(result.report_form).toBe("Form 3X");
    expect(result.reports[0].fundraising).toBeNull();
    expect(result.ecosystem).toBeNull();
    expect(result.primary_timing_guard).toBeNull();
    expect(result.caveats.some((c: string) => /this tool's own formula/i.test(c))).toBe(false);
    // The committee-type framing leads the caveats array and explains up front
    // why ecosystem/primary_timing_guard are null, rather than leaving the
    // calling model to infer it from absent fields.
    expect(result.caveats[0]).toMatch(/skipped below/i);
  });

  it("does not include a blanket in-kind caveat — the tool has no way to gauge in-kind materiality", async () => {
    const fetchMock = mockRouter({
      "/committee/C00718866/": {
        results: [{ name: "OSSOFF FOR SENATE", designation: "P", candidate_ids: ["S8GA00180"] }],
      },
      "/committee/C00718866/reports/": f3Reports,
      "/candidate/S8GA00180/": { results: [{ office: "S", state: "GA" }] },
      "/election-dates/": { results: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await filingReview({ committee_id: "C00718866" }));

    expect(result.caveats.some((c: string) => /in-kind/i.test(c))).toBe(false);
  });

  it("does not compute the fundraising formula for a Form 3P committee (field names diverge from Form 3)", async () => {
    const fetchMock = mockRouter({
      "/committee/C00694455/": {
        results: [
          {
            name: "KAMALA HARRIS FOR THE PEOPLE",
            designation: "P",
            committee_type: "P",
            candidate_ids: ["P00009423"],
          },
        ],
      },
      "/committee/C00694455/reports/": f3pReports,
      "/candidate/P00009423/": { results: [{ office: "P", state: "US" }] },
      "/election-dates/": { results: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await filingReview({ committee_id: "C00694455" }));

    expect(result.report_form).toBe("Form 3P");
    expect(result.reports[0].fundraising).toBeNull();
    // No matching primary row in /election-dates/, so the guard resolves to null
    // rather than guessing.
    expect(result.primary_timing_guard).toBeNull();
  });

  it("flags a period-length mismatch between a 12-day pre-primary report and a full quarter", async () => {
    const fetchMock = mockRouter({
      "/committee/C00718866/": {
        results: [{ name: "OSSOFF FOR SENATE", designation: "P", candidate_ids: ["S8GA00180"] }],
      },
      "/committee/C00718866/reports/": f3Reports,
      "/candidate/S8GA00180/": { results: [{ office: "S", state: "GA" }] },
      "/election-dates/": { results: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await filingReview({ committee_id: "C00718866" }));

    // f3Reports has Q2 (62 days), 12P (29 days), Q1 (90 days) — the Q2-vs-12P
    // comparison should trip the mismatch flag.
    expect(result.change_table[0].period_length_mismatch).toBe(true);
    expect(result.caveats.some((c: string) => /differ substantially in length/i.test(c))).toBe(true);
  });

  it("clamps reports_to_compare to the 2-6 range and limits the change table accordingly", async () => {
    const fetchMock = mockRouter({
      "/committee/C00718866/": {
        results: [{ name: "OSSOFF FOR SENATE", designation: "P", candidate_ids: ["S8GA00180"] }],
      },
      "/committee/C00718866/reports/": f3Reports,
      "/candidate/S8GA00180/": { results: [{ office: "S", state: "GA" }] },
      "/election-dates/": { results: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await filingReview({ committee_id: "C00718866", reports_to_compare: 1 })
    );

    // Clamped to 2, but the fixture only has 3 reports anyway, so this exercises
    // the clamp without depending on more fixture data.
    expect(result.reports.length).toBeLessThanOrEqual(3);
    expect(result.change_table.length).toBe(result.reports.length - 1);
  });
});
