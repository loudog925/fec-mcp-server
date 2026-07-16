import { describe, it, expect, vi, beforeEach } from "vitest";
import { candidateSearch } from "../src/tools/candidates.js";

describe("candidateSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when no search filters are provided", async () => {
    await expect(candidateSearch({})).rejects.toThrow("Provide at least one of");
  });

  it("calls the FEC candidates search endpoint and returns JSON text", async () => {
    const mockResponse = { results: [{ candidate_id: "H8CA01234", name: "DOE, JANE" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await candidateSearch({ q: "Jane Doe", state: "CA" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidates/search/");
    expect(calledUrl).toContain("q=Jane");
    expect(calledUrl).toContain("state=CA");
  });
});
