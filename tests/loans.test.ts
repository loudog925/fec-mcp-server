import { describe, it, expect, vi, beforeEach } from "vitest";
import { loans } from "../src/tools/loans.js";

describe("loans", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(loans({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("calls the schedule_c endpoint with an uppercased committee_id and filters", async () => {
    const mockResponse = { results: [{ loan_source_name: "BIG BANK", original_loan_amount: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loans({ committee_id: "c00401224", loan_source_name: "Big Bank" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_c/");
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("loan_source_name=Big");
  });
});
