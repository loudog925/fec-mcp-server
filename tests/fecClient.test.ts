import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFEC, getApiKey, FecApiError } from "../src/fecClient.js";

describe("getApiKey", () => {
  it("throws when FEC_API_KEY is not set", () => {
    delete process.env.FEC_API_KEY;
    expect(() => getApiKey()).toThrow("FEC_API_KEY");
  });

  it("returns the key when set", () => {
    process.env.FEC_API_KEY = "abc123";
    expect(getApiKey()).toBe("abc123");
  });
});

describe("fetchFEC", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("builds the URL with base path, params, and api_key, and returns parsed JSON", async () => {
    const mockBody = { results: [{ candidate_id: "H8CA01234" }] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchFEC("/candidates/search/", { q: "Jane Doe", cycle: [2024, 2026] });

    expect(data).toEqual(mockBody);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("https://api.open.fec.gov/v1/candidates/search/")).toBe(true);
    expect(calledUrl).toContain("api_key=test-key");
    expect(calledUrl).toContain("q=Jane");
    expect(calledUrl).toContain("cycle=2024");
    expect(calledUrl).toContain("cycle=2026");
  });

  it("omits undefined params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFEC("/candidates/search/", { q: "Jane", state: undefined });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("state=");
  });

  it("throws a RATE_LIMITED FecApiError on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("throws a BAD_REQUEST FecApiError with the API's message on HTTP 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Invalid state code" }),
      })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid state code",
    });
  });

  it("throws an UNAVAILABLE FecApiError on HTTP 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("throws an UNAVAILABLE FecApiError when the network request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("gives an actionable message (not a generic timeout) when the underlying failure is a TLS certificate error", async () => {
    const certError = new TypeError("fetch failed");
    (certError as unknown as { cause: unknown }).cause = {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
      message: "self-signed certificate in certificate chain",
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(certError));

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: expect.stringContaining("--use-system-ca"),
    });
  });
});
