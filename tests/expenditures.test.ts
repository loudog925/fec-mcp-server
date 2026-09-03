import { describe, it, expect, vi, beforeEach } from "vitest";
import { itemizedExpenditures } from "../src/tools/expenditures.js";

describe("itemizedExpenditures", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor recipient_name is provided", async () => {
    await expect(itemizedExpenditures({})).rejects.toThrow(
      "Provide at least committee_id or recipient_name"
    );
  });

  it("calls the schedule_b endpoint with the given filters", async () => {
    const mockResponse = { results: [{ recipient_name: "ACME MEDIA", disbursement_amount: 5000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await itemizedExpenditures({
      committee_id: ["C00358796"],
      disbursement_description: "media buy",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/");
    expect(calledUrl).toContain("committee_id=C00358796");
    expect(calledUrl).toContain("disbursement_description=media");
  });

  it("passes page through to the schedule_b endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await itemizedExpenditures({ committee_id: ["C00358796"], page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });

  it("passes last_index/last_disbursement_date through to the schedule_b endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await itemizedExpenditures({
      committee_id: ["C00358796"],
      last_index: "4041720221492367184",
      last_disbursement_date: "2024-10-02",
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("last_index=4041720221492367184");
    expect(calledUrl).toContain("last_disbursement_date=2024-10-02");
  });

  it("rejects a page beyond the deep-paging cap", async () => {
    await expect(
      itemizedExpenditures({ committee_id: ["C00358796"], page: 999 })
    ).rejects.toThrow(/last_index/);
  });
});
