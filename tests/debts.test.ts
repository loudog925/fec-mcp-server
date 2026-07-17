import { describe, it, expect, vi, beforeEach } from "vitest";
import { debts } from "../src/tools/debts.js";

describe("debts", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when committee_id is missing", async () => {
    await expect(debts({ committee_id: "" })).rejects.toThrow(
      "committee_id is required"
    );
  });

  it("calls the schedule_d endpoint with an uppercased committee_id and filters", async () => {
    const mockResponse = { results: [{ creditor_debtor_name: "OFFICE SUPPLY CO", amount_incurred_period: 2000 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await debts({ committee_id: "c00401224", creditor_debtor_name: "Office Supply" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_d/");
    expect(calledUrl).toContain("committee_id=C00401224");
    expect(calledUrl).toContain("creditor_debtor_name=Office");
  });
});
