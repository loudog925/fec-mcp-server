import { describe, it, expect, vi, beforeEach } from "vitest";
import { contributionBreakdown } from "../src/tools/contributionBreakdown.js";

describe("contributionBreakdown", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(
      contributionBreakdown({ mode: "by_state", committee_id: [] })
    ).rejects.toThrow("committee_id is required");
  });

  it("calls by_state with an uppercased committee_id and the state/hide_null filters", async () => {
    const mockResponse = { results: [{ state: "GA", state_full: "Georgia", total: 1000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await contributionBreakdown({
      mode: "by_state",
      committee_id: ["c00718866"],
      state: ["GA"],
      hide_null: true,
    });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/by_state/");
    expect(calledUrl).toContain("committee_id=C00718866");
    expect(calledUrl).toContain("state=GA");
    expect(calledUrl).toContain("hide_null=true");
  });

  it("does not leak mode-specific filters into other modes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await contributionBreakdown({
      mode: "by_employer",
      committee_id: ["C00718866"],
      state: ["GA"],
      employer: ["ACME"],
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_a/by_employer/");
    expect(calledUrl).toContain("employer=ACME");
    expect(calledUrl).not.toContain("state=");
  });

  it("routes by_occupation and by_size to their respective endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await contributionBreakdown({ mode: "by_occupation", committee_id: ["C00718866"] });
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/schedules/schedule_a/by_occupation/");

    await contributionBreakdown({ mode: "by_size", committee_id: ["C00718866"], size: [2000] });
    const sizeUrl = fetchMock.mock.calls[1][0] as string;
    expect(sizeUrl).toContain("/schedules/schedule_a/by_size/");
    expect(sizeUrl).toContain("size=2000");
  });

  it("computes size_profile_by_group (grassroots vs. large-dollar share) for by_size mode", async () => {
    const mockResponse = {
      results: [
        { committee_id: "C00718866", cycle: 2026, size: 0, total: 100 },
        { committee_id: "C00718866", cycle: 2026, size: 200, total: 50 },
        { committee_id: "C00718866", cycle: 2026, size: 2000, total: 350 },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockResponse })
    );

    const result = JSON.parse(
      await contributionBreakdown({ mode: "by_size", committee_id: ["C00718866"] })
    );

    expect(result.results).toEqual(mockResponse.results);
    expect(result.size_profile_by_group).toEqual([
      {
        committee_id: "C00718866",
        cycle: 2026,
        total: 500,
        grassroots_total: 100,
        grassroots_share: 0.2,
        large_dollar_total: 350,
        large_dollar_share: 0.7,
      },
    ]);
  });

  it("computes size_profile_by_group separately per (committee_id, cycle), and does not attach it to other modes", async () => {
    const mockResponse = {
      results: [
        { committee_id: "C00001", cycle: 2024, size: 0, total: 90 },
        { committee_id: "C00001", cycle: 2024, size: 2000, total: 10 },
        { committee_id: "C00002", cycle: 2024, size: 0, total: 10 },
        { committee_id: "C00002", cycle: 2024, size: 2000, total: 90 },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockResponse })
    );

    const sizeResult = JSON.parse(
      await contributionBreakdown({ mode: "by_size", committee_id: ["C00001", "C00002"] })
    );
    const byCommittee = Object.fromEntries(
      sizeResult.size_profile_by_group.map((g: { committee_id: string; large_dollar_share: number }) => [
        g.committee_id,
        g.large_dollar_share,
      ])
    );
    expect(byCommittee["C00001"]).toBeCloseTo(0.1);
    expect(byCommittee["C00002"]).toBeCloseTo(0.9);

    const stateResult = JSON.parse(
      await contributionBreakdown({ mode: "by_state", committee_id: ["C00001"] })
    );
    expect(stateResult.size_profile_by_group).toBeUndefined();
  });

  it("passes cycle and page through", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await contributionBreakdown({
      mode: "by_state",
      committee_id: ["C00718866"],
      cycle: [2026],
      page: 2,
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("cycle=2026");
    expect(calledUrl).toContain("page=2");
  });
});
