import { describe, it, expect, vi, beforeEach } from "vitest";
import { donorSearch } from "../src/tools/donors.js";

describe("donorSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when contributor_name is missing", async () => {
    await expect(donorSearch({ contributor_name: "" })).rejects.toThrow(
      "contributor_name is required"
    );
  });

  it("calls the schedule_a endpoint scoped by contributor fields, across all committees", async () => {
    const mockResponse = { results: [{ contributor_name: "SMITH, JOHN", contributor_employer: "ACME CORP" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await donorSearch({
      contributor_name: "John Smith",
      contributor_employer: "Acme Corp",
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/");
    expect(calledUrl).toContain("contributor_name=John");
    expect(calledUrl).toContain("contributor_employer=Acme");
    expect(calledUrl).not.toContain("committee_id=");
  });

  it("passes page through to the schedule_a endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await donorSearch({ contributor_name: "John Smith", page: 3 });

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

    await donorSearch({
      contributor_name: "John Smith",
      last_index: "4041720221492367184",
      last_contribution_receipt_date: "2024-10-02",
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("last_index=4041720221492367184");
    expect(calledUrl).toContain("last_contribution_receipt_date=2024-10-02");
  });

  it("rejects a page beyond the deep-paging cap", async () => {
    await expect(
      donorSearch({ contributor_name: "John Smith", page: 999 })
    ).rejects.toThrow(/last_index/);
  });
});
