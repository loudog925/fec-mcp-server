import { describe, it, expect, vi, beforeEach } from "vitest";
import { loans } from "../src/tools/loans.js";

describe("loans", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor loan_source_name is provided", async () => {
    await expect(loans({})).rejects.toThrow(
      "Provide at least committee_id or loan_source_name"
    );
  });

  it("calls the schedule_c endpoint with an uppercased committee_id and filters", async () => {
    const mockResponse = { results: [{ loan_source_name: "BIG BANK", original_loan_amount: 50000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loans({ committee_id: "c00401224", loan_source_name: "Big Bank" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_c/");
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("loan_source_name=Big");
  });

  it("searches by loan_source_name alone, across all committees", async () => {
    const mockResponse = { results: [{ committee_id: "C00910612", loan_source_name: "BANK OF AMERICA" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loans({ loan_source_name: "Bank of America" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_c/");
    expect(calledUrl).toContain("loan_source_name=Bank");
    expect(calledUrl).not.toContain("committee_id=");
  });

  it("passes page through to the schedule_c endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await loans({ committee_id: "C00401224", page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });
});
