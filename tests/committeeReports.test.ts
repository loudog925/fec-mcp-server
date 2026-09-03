import { describe, it, expect, vi, beforeEach } from "vitest";
import { committeeReports } from "../src/tools/committeeReports.js";

describe("committeeReports", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(committeeReports({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("defaults to most_recent=true when is_amended is not provided", async () => {
    const mockResponse = { results: [{ cash_on_hand_end_period: 50000, most_recent: true }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeReports({ committee_id: "c00401224" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00401224/reports/");
    expect(calledUrl).toContain("most_recent=true");
  });

  it("filters out superseded rows client-side, since upstream most_recent=true does not actually filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { file_number: 1, most_recent: false },
          { file_number: 2, most_recent: true },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeReports({ committee_id: "C00401224" });

    expect(JSON.parse(result).results).toEqual([{ file_number: 2, most_recent: true }]);
  });

  it("does not filter results when is_amended is explicitly provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { file_number: 1, most_recent: false },
          { file_number: 2, most_recent: true },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeReports({ committee_id: "C00401224", is_amended: true });

    expect(JSON.parse(result).results).toHaveLength(2);
  });

  it("omits most_recent when is_amended is explicitly provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await committeeReports({ committee_id: "C00401224", is_amended: true });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("is_amended=true");
    expect(calledUrl).not.toContain("most_recent=");
  });

  it("passes page through to the reports endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await committeeReports({ committee_id: "C00401224", page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });
});
