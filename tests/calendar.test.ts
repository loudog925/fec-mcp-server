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

  it("normalizes create_date/update_date to YYYY-MM-DD in election_dates mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            election_date: "2026-11-03",
            create_date: "2026-01-21T14:48:27",
            update_date: "2026-01-22T16:31:35",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await calendar({ mode: "election_dates", election_year: 2026 });
    const parsed = JSON.parse(result);

    expect(parsed.results[0].create_date).toBe("2026-01-21");
    expect(parsed.results[0].update_date).toBe("2026-01-22");
  });

  it("dedupes filing_deadlines rows by due_date/report_type/report_type_full/report_year and adds filer_count", async () => {
    const rawRows = [
      { due_date: "2026-12-03", report_type: "30G", report_type_full: "General", report_year: 2026, create_date: "2026-01-01", update_date: "2026-01-01" },
      { due_date: "2026-12-03", report_type: "30G", report_type_full: "General", report_year: 2026, create_date: "2026-01-01", update_date: "2026-01-01" },
      { due_date: "2026-12-03", report_type: "30G", report_type_full: "General", report_year: 2026, create_date: "2026-01-01", update_date: "2026-01-01" },
      { due_date: "2026-10-15", report_type: "Q3", report_type_full: "Quarterly", report_year: 2026, create_date: "2026-01-01", update_date: "2026-01-01" },
      // Same due_date as the 30G rows above but a different report_type — must stay a distinct row.
      { due_date: "2026-12-03", report_type: "M12", report_type_full: "Monthly", report_year: 2026, create_date: "2026-01-01", update_date: "2026-01-01" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: rawRows, pagination: { count: rawRows.length, pages: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await calendar({
      mode: "filing_deadlines",
      min_date: "2026-07-25",
      max_date: "2026-12-31",
      report_year: 2026,
    });
    const parsed = JSON.parse(result);

    expect(parsed.pagination.count).toBe(3);
    expect(parsed.results).toHaveLength(3);

    const thirtyG = parsed.results.find((r: { report_type: string }) => r.report_type === "30G");
    const q3 = parsed.results.find((r: { report_type: string }) => r.report_type === "Q3");
    const monthly = parsed.results.find((r: { report_type: string }) => r.report_type === "M12");

    expect(thirtyG.filer_count).toBe(3);
    expect(q3.filer_count).toBe(1);
    expect(monthly.filer_count).toBe(1);
    expect(thirtyG.due_date).toBe(monthly.due_date); // same due_date, distinct report_type, not merged
  });

  it("walks all upstream pages of /reporting-dates/ before deduping", async () => {
    const page1Rows = Array.from({ length: 100 }, (_, i) => ({
      due_date: "2026-12-03",
      report_type: "30G",
      report_type_full: "General",
      report_year: 2026,
    }));
    const page2Rows = [
      { due_date: "2026-10-15", report_type: "Q3", report_type_full: "Quarterly", report_year: 2026 },
    ];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("page=2")
          ? { results: page2Rows, pagination: { count: 101, pages: 2 } }
          : { results: page1Rows, pagination: { count: 101, pages: 2 } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await calendar({ mode: "filing_deadlines", report_year: 2026 });
    const parsed = JSON.parse(result);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parsed.pagination.count).toBe(2);
  });
});
