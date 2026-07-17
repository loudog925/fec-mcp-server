import { describe, it, expect, vi, beforeEach } from "vitest";
import { independentExpenditures } from "../src/tools/independentExp.js";

describe("independentExpenditures", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither candidate_id nor committee_id is provided", async () => {
    await expect(independentExpenditures({})).rejects.toThrow(
      "Provide at least candidate_id or committee_id"
    );
  });

  it("calls the schedule_e endpoint with the given filters", async () => {
    const mockResponse = { results: [{ payee_name: "MEDIA BUYS LLC", expenditure_amount: 250000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await independentExpenditures({
      candidate_id: ["S0OH00133"],
      support_oppose_indicator: "O",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_e/");
    expect(calledUrl).toContain("candidate_id=S0OH00133");
    expect(calledUrl).toContain("support_oppose_indicator=O");
  });

  it("passes page through to the schedule_e endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await independentExpenditures({ candidate_id: ["S0OH00133"], page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });
});
