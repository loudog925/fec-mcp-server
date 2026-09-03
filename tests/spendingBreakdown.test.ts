import { describe, it, expect, vi, beforeEach } from "vitest";
import { spendingBreakdown } from "../src/tools/spendingBreakdown.js";

describe("spendingBreakdown", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(
      spendingBreakdown({ mode: "by_purpose", committee_id: [] })
    ).rejects.toThrow("committee_id is required");
  });

  it("calls by_purpose with an uppercased committee_id and computes unclassified_share_by_group", async () => {
    const mockResponse = {
      results: [
        { committee_id: "C00718866", cycle: 2026, purpose: "ADVERTISING", total: 300 },
        { committee_id: "C00718866", cycle: 2026, purpose: "OTHER", total: 100 },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await spendingBreakdown({ mode: "by_purpose", committee_id: ["c00718866"] })
    );

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/by_purpose/");
    expect(calledUrl).toContain("committee_id=C00718866");

    expect(result.results).toEqual(mockResponse.results);
    expect(result.unclassified_share_by_group).toEqual([
      { committee_id: "C00718866", cycle: 2026, total: 400, other_total: 100, unclassified_share: 0.25 },
    ]);
  });

  it("computes unclassified_share_by_group separately per (committee_id, cycle)", async () => {
    const mockResponse = {
      results: [
        { committee_id: "C00001", cycle: 2024, purpose: "OTHER", total: 50 },
        { committee_id: "C00001", cycle: 2024, purpose: "TRAVEL", total: 50 },
        { committee_id: "C00002", cycle: 2024, purpose: "OTHER", total: 10 },
        { committee_id: "C00002", cycle: 2024, purpose: "TRAVEL", total: 90 },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockResponse })
    );

    const result = JSON.parse(
      await spendingBreakdown({ mode: "by_purpose", committee_id: ["C00001", "C00002"] })
    );

    const byCommittee = Object.fromEntries(
      result.unclassified_share_by_group.map((g: { committee_id: string; unclassified_share: number }) => [
        g.committee_id,
        g.unclassified_share,
      ])
    );
    expect(byCommittee["C00001"]).toBeCloseTo(0.5);
    expect(byCommittee["C00002"]).toBeCloseTo(0.1);
  });

  it("routes by_recipient to its endpoint with recipient_name filters, without the unclassified summary", async () => {
    const mockResponse = { results: [{ recipient_name: "ACME PRINTING", total: 500 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(
      await spendingBreakdown({
        mode: "by_recipient",
        committee_id: ["C00718866"],
        recipient_name: ["ACME"],
      })
    );

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_b/by_recipient/");
    expect(calledUrl).toContain("recipient_name=ACME");
    expect(result).toEqual(mockResponse);
    expect(result.unclassified_share_by_group).toBeUndefined();
  });

  it("passes cycle and page through", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await spendingBreakdown({
      mode: "by_purpose",
      committee_id: ["C00718866"],
      cycle: [2026],
      page: 2,
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("cycle=2026");
    expect(calledUrl).toContain("page=2");
  });
});
