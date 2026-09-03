import { describe, it, expect, vi, beforeEach } from "vitest";
import { itemizedContributions } from "../src/tools/contributions.js";
import * as fecClient from "../src/fecClient.js";

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

  it("passes page through to the schedule_a endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await itemizedContributions({ committee_id: ["C00358796"], page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });

  it("passes last_index/last_contribution_receipt_date through to the schedule_a endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await itemizedContributions({
      committee_id: ["C00358796"],
      last_index: "4041720221492367184",
      last_contribution_receipt_date: "2024-10-02",
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("last_index=4041720221492367184");
    expect(calledUrl).toContain("last_contribution_receipt_date=2024-10-02");
  });

  it("uses a 60000ms timeout, since unnarrowed schedule_a queries have been observed taking ~26s upstream", async () => {
    const fetchPaginatedFECSpy = vi
      .spyOn(fecClient, "fetchPaginatedFEC")
      .mockResolvedValue({ results: [] });

    await itemizedContributions({ committee_id: ["C00358796"] });

    expect(fetchPaginatedFECSpy).toHaveBeenCalledWith(
      "/schedules/schedule_a/",
      expect.any(Object),
      60000
    );
  });

  it("rejects a page beyond the deep-paging cap", async () => {
    await expect(
      itemizedContributions({ committee_id: ["C00358796"], page: 999 })
    ).rejects.toThrow(/last_index/);
  });
});
