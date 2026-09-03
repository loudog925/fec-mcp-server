import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFEC, fetchPaginatedFEC, getApiKey, FecApiError } from "../src/fecClient.js";

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
    process.env.FEC_RATE_LIMIT_BASE_MS = "0";
    delete process.env.FEC_RATE_LIMIT_RETRIES;
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

  it("retries after a 429 and returns the body from the eventual 200", async () => {
    const mockBody = { results: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => mockBody });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchFEC("/candidates/search/", {});

    expect(data).toEqual(mockBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a numeric Retry-After header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "0" : null) },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchFEC("/candidates/search/", {});

    expect(data).toEqual({ results: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws RATE_LIMITED after exhausting retries", async () => {
    process.env.FEC_RATE_LIMIT_RETRIES = "2";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-429 4xx error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ message: "bad" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFEC("/candidates/search/", {})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not abort a retried attempt because of a timeout that started on a previous attempt", async () => {
    process.env.FEC_RATE_LIMIT_BASE_MS = "30";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        expect(init?.signal?.aborted).toBe(false);
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchFEC("/candidates/search/", {}, 15);

    expect(data).toEqual({ results: [] });
  });
});

describe("fetchPaginatedFEC", () => {
  beforeEach(() => {
    process.env.FEC_API_KEY = "test-key";
    delete process.env.FEC_MAX_PAGE;
    vi.restoreAllMocks();
  });

  it("throws when page exceeds FEC_MAX_PAGE, naming last_index, without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPaginatedFEC("/schedules/schedule_a/", { page: 11 })
    ).rejects.toThrow(/last_index/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects a FEC_MAX_PAGE override", async () => {
    process.env.FEC_MAX_PAGE = "20";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], pagination: { page: 11 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchPaginatedFEC<{ pagination_warning?: string }>(
      "/schedules/schedule_a/",
      { page: 11 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.pagination_warning).toBeDefined();
  });

  it("throws when the response pagination.page does not match the requested page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], pagination: { page: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPaginatedFEC("/schedules/schedule_a/", { page: 5 })
    ).rejects.toThrow(/silently caps deep paging/);
  });

  it("attaches pagination_warning for page 2..threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchPaginatedFEC<{ pagination_warning?: string }>(
      "/schedules/schedule_a/",
      { page: 3 }
    );

    expect(data.pagination_warning).toBeDefined();
  });

  it("does not attach pagination_warning or throw for page 1 or cursor-only calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const page1 = await fetchPaginatedFEC<{ pagination_warning?: string }>(
      "/schedules/schedule_a/",
      { page: 1 }
    );
    expect(page1.pagination_warning).toBeUndefined();

    const cursorOnly = await fetchPaginatedFEC<{ pagination_warning?: string }>(
      "/schedules/schedule_a/",
      { last_index: "123" }
    );
    expect(cursorOnly.pagination_warning).toBeUndefined();
  });
});
