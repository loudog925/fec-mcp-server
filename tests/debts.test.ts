import { describe, it, expect, vi, beforeEach } from "vitest";
import { debts } from "../src/tools/debts.js";

describe("debts", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("throws when neither committee_id nor creditor_debtor_name is provided", async () => {
    await expect(debts({})).rejects.toThrow(
      "Provide at least committee_id or creditor_debtor_name"
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

  it("searches by creditor_debtor_name alone, across all committees", async () => {
    const mockResponse = { results: [{ committee_id: "C00309567", creditor_debtor_name: "VERIZON WIRELESS" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await debts({ creditor_debtor_name: "Verizon" });

    expect(JSON.parse(result)).toEqual(mockResponse);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/schedules/schedule_d/");
    expect(calledUrl).toContain("creditor_debtor_name=Verizon");
    expect(calledUrl).not.toContain("committee_id=");
  });

  it("passes page through to the schedule_d endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await debts({ committee_id: "C00401224", page: 3 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
  });
});
