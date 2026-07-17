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

  it("passes page through to the list search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await candidateSearch({ q: "Smith", page: 2 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=2");
  });

  it("does a direct single-candidate lookup via /candidate/{id}/ for richer detail", async () => {
    const mockResponse = { results: [{ candidate_id: "S0GA00559", candidate_status: "C" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await candidateSearch({ candidate_id: ["s0ga00559"] });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/S0GA00559/");
    expect(calledUrl).not.toContain("/candidates/search/");
  });

  it("uses the list search when candidate_id is combined with other filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await candidateSearch({ candidate_id: ["s0ga00559"], state: "GA" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidates/search/");
    expect(calledUrl).toContain("candidate_id=S0GA00559");
    expect(calledUrl).toContain("state=GA");
  });
});
