import { describe, it, expect, vi, beforeEach } from "vitest";
import { financialSummary } from "../src/tools/financials.js";

describe("financialSummary", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when candidate_id is missing", async () => {
    await expect(financialSummary({ candidate_id: "" })).rejects.toThrow(
      "candidate_id is required"
    );
  });

  it("calls the candidate totals endpoint with an uppercased candidate_id", async () => {
    const mockResponse = { results: [{ receipts: 100000, disbursements: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await financialSummary({ candidate_id: "h8ca01234", cycle: [2024] });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/H8CA01234/totals/");
    expect(calledUrl).toContain("cycle=2024");
  });
});
