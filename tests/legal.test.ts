import { describe, it, expect, vi, beforeEach } from "vitest";
import { legalSearch } from "../src/tools/legal.js";

describe("legalSearch", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when no filter is provided", async () => {
    await expect(legalSearch({})).rejects.toThrow("Provide at least query, type");
  });

  it("calls /legal/search/ with mapped param names", async () => {
    const mockResponse = { results: [{ ao_no: "2024-01", name: "Example AO" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    await legalSearch({
      query: "coordinated spending",
      type: "advisory_opinions",
      respondent: "Acme PAC",
      regulatory_citation: "11 CFR 112.4",
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/legal/search/");
    expect(calledUrl).toContain("q=coordinated");
    expect(calledUrl).toContain("type=advisory_opinions");
    expect(calledUrl).toContain("case_respondents=Acme");
    expect(calledUrl).toContain("ao_regulatory_citation=11");
    expect(calledUrl).toContain("from_hit=0");
    expect(calledUrl).toContain("hits_returned=20");
  });

  it("trims oversized highlights, documents, and commission_votes before returning", async () => {
    const mockResponse = {
      results: [
        {
          case_no: "MUR-1234",
          highlights: ["a", "b", "c", "d", "e"],
          document_highlights: { some: "bulky map" },
          documents: [
            { category: "Conciliation Agreement", url: "x" },
            { category: "Conciliation Agreement", url: "y" },
            { category: "Complaint", url: "z" },
          ],
          commission_votes: [
            { vote_date: "2024-01-01", action: "A".repeat(300) },
          ],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await legalSearch({ case_number: "MUR-1234" });
    const parsed = JSON.parse(result);
    const doc = parsed.results[0];

    expect(doc.highlights).toHaveLength(3);
    expect(doc.document_highlights).toBeUndefined();
    expect(doc.documents).toBeUndefined();
    expect(doc.document_count).toBe(3);
    expect(doc.document_categories).toEqual(["Conciliation Agreement", "Complaint"]);
    expect(doc.commission_votes[0].action).toHaveLength(200);
  });
});
