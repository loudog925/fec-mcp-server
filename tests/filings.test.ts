import { describe, it, expect, vi, beforeEach } from "vitest";
import { filings } from "../src/tools/filings.js";

describe("filings", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither candidate_id nor committee_id is provided", async () => {
    await expect(filings({})).rejects.toThrow(
      "Provide exactly one of candidate_id or committee_id"
    );
  });

  it("throws when both candidate_id and committee_id are provided", async () => {
    await expect(
      filings({ candidate_id: "H8CA01234", committee_id: "C00358796" })
    ).rejects.toThrow("Provide only one of candidate_id or committee_id");
  });

  it("calls the candidate filings endpoint with a default RFAI form_type filter", async () => {
    const mockResponse = { results: [{ form_type: "RFAI", file_number: 123456 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await filings({ candidate_id: "h8ca01234" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/candidate/H8CA01234/filings/");
    expect(calledUrl).toContain("form_type=RFAI");
  });

  it("calls the committee filings endpoint when committee_id is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await filings({ committee_id: "c00358796", is_amended: true });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/committee/C00358796/filings/");
    expect(calledUrl).toContain("is_amended=true");
  });

  it("accepts a non-RFAI form_type for general filing lookups", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await filings({ committee_id: "C00401224", form_type: ["F3X"] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("form_type=F3X");
    expect(calledUrl).not.toContain("form_type=RFAI");
  });
});
