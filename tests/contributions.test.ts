import { describe, it, expect, vi, beforeEach } from "vitest";
import { itemizedContributions } from "../src/tools/contributions.js";

describe("itemizedContributions", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor contributor_name is provided", async () => {
    await expect(itemizedContributions({})).rejects.toThrow(
      "Provide at least committee_id or contributor_name"
    );
  });

  it("calls the schedule_a endpoint with the given filters", async () => {
    const mockResponse = { results: [{ contributor_name: "SMITH, JOHN", contribution_receipt_amount: 500 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await itemizedContributions({
      committee_id: ["C00358796"],
      min_amount: 200,
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/");
    expect(calledUrl).toContain("committee_id=C00358796");
    expect(calledUrl).toContain("min_amount=200");
  });
});
