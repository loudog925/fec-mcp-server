import { describe, it, expect, vi, beforeEach } from "vitest";
import { spendingSearch } from "../src/tools/spending.js";

describe("spendingSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither recipient_name nor disbursement_description is provided", async () => {
    await expect(spendingSearch({})).rejects.toThrow(
      "Provide at least recipient_name or disbursement_description"
    );
  });

  it("calls the schedule_b endpoint scoped by recipient/description, across all committees", async () => {
    const mockResponse = { results: [{ recipient_name: "ACME MEDIA", disbursement_description: "TV ADS" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await spendingSearch({
      recipient_name: "Acme Media",
      disbursement_description: "TV ads",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/");
    expect(calledUrl).toContain("recipient_name=Acme");
    expect(calledUrl).not.toContain("committee_id=");
  });

  it("passes page through to the schedule_b endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await spendingSearch({ recipient_name: "Acme", page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });
});
