import { describe, it, expect, vi, beforeEach } from "vitest";
import { calendar } from "../src/tools/calendar.js";

describe("calendar", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("defaults to events mode and calls /calendar-dates/", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await calendar({ min_date: "2026-01-01", max_date: "2026-12-31", category: "21" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/calendar-dates/?");
    expect(calledUrl).toContain("min_start_date=2026-01-01");
    expect(calledUrl).toContain("max_start_date=2026-12-31");
    expect(calledUrl).toContain("calendar_category_id=21");
  });

  it("calls /reporting-dates/ with due-date params in filing_deadlines mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await calendar({
      mode: "filing_deadlines",
      min_date: "2026-01-01",
      max_date: "2026-12-31",
      report_type: "Q1",
      report_year: 2026,
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/reporting-dates/?");
    expect(calledUrl).toContain("min_due_date=2026-01-01");
    expect(calledUrl).toContain("max_due_date=2026-12-31");
    expect(calledUrl).toContain("report_type=Q1");
    expect(calledUrl).toContain("report_year=2026");
  });

  it("calls /election-dates/ with election-date params in election_dates mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await calendar({
      mode: "election_dates",
      state: "OH",
      office: "H",
      election_year: 2026,
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/election-dates/?");
    expect(calledUrl).toContain("election_state=OH");
    expect(calledUrl).toContain("office_sought=H");
    expect(calledUrl).toContain("election_year=2026");
  });
});
