import { describe, it, expect, vi, beforeEach } from "vitest";
import { elections } from "../src/tools/elections.js";

describe("elections", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when cycle is odd", async () => {
    await expect(
      elections({ office: "P", cycle: 2025 })
    ).rejects.toThrow("cycle must be an even year");
  });

  it("throws when state is missing for a senate race without zip", async () => {
    await expect(
      elections({ office: "S", cycle: 2024 })
    ).rejects.toThrow("state is required");
  });

  it("throws when district is missing for a house race without zip", async () => {
    await expect(
      elections({ office: "H", cycle: 2024, state: "OH" })
    ).rejects.toThrow("district is required");
  });

  it("throws when zip is combined with summary mode", async () => {
    await expect(
      elections({ office: "P", cycle: 2024, mode: "summary", zip: "43210" })
    ).rejects.toThrow("Summary mode does not support zip");
  });

  it("calls /elections/ for a search-mode request without zip", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await elections({ office: "H", cycle: 2024, state: "OH", district: "07" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/elections/?");
    expect(calledUrl).toContain("office=house");
    expect(calledUrl).toContain("cycle=2024");
    expect(calledUrl).toContain("state=OH");
    expect(calledUrl).toContain("district=07");
  });

  it("calls /elections/search/ when zip is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await elections({ office: "P", cycle: 2024, zip: "43210" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/elections/search/?");
    expect(calledUrl).toContain("zip=43210");
  });

  it("calls /elections/summary/ for summary mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await elections({ office: "P", cycle: 2024, mode: "summary" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/elections/summary/?");
    expect(calledUrl).toContain("office=president");
  });

  it("flags the independent_expenditures aggregate as unreconciled in summary mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ receipts: 100, independent_expenditures: 999999999999 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await elections({ office: "P", cycle: 2024, mode: "summary" });
    const parsed = JSON.parse(result);

    expect(parsed.independent_expenditures_note).toContain("unreconciled");
  });
});
