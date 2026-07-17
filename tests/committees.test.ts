import { describe, it, expect, vi, beforeEach } from "vitest";
import { committeeSearch } from "../src/tools/committees.js";

describe("committeeSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when no search filters are provided", async () => {
    await expect(committeeSearch({})).rejects.toThrow("Provide at least one of");
  });

  it("calls the FEC committees endpoint and returns JSON text", async () => {
    const mockResponse = { results: [{ committee_id: "C00401224", name: "ACTBLUE" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeSearch({ q: "ActBlue", state: "MA" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committees/");
    expect(calledUrl).toContain("q=ActBlue");
    expect(calledUrl).toContain("state=MA");
  });

  it("does a direct single-committee lookup via /committee/{id}/, exposing email/website", async () => {
    const mockResponse = {
      results: [{ committee_id: "C00777045", name: "ADAM FOR DEMOCRACY", email: "ADAM@ADAMFORDEMOCRACY.COM" }],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await committeeSearch({ committee_id: ["c00777045"], cycle: [2022] });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00777045/");
    expect(calledUrl).not.toContain("/committees/");
    expect(calledUrl).toContain("cycle=2022");
  });

  it("uppercases committee_id and candidate_id arrays", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await committeeSearch({ committee_id: ["c00401224"], candidate_id: ["h8ca01234"] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("candidate_id=H8CA01234");
  });
});
