const BASE_URL = "https://api.open.fec.gov/v1";

export type FecParams = Record<
  string,
  string | number | boolean | (string | number)[] | undefined
>;

export class FecApiError extends Error {
  code: "RATE_LIMITED" | "BAD_REQUEST" | "UNAVAILABLE";
  status?: number;

  constructor(message: string, code: FecApiError["code"], status?: number) {
    super(message);
    this.name = "FecApiError";
    this.code = code;
    this.status = status;
  }
}

export function getApiKey(): string {
  const key = process.env.FEC_API_KEY;
  if (!key) {
    throw new Error(
      "FEC_API_KEY environment variable is not set. Add it to a local .env file, " +
        "or set it in your Claude Desktop/Code MCP config's env block."
    );
  }
  return key;
}

function getTimeoutMs(defaultMs: number): number {
  const raw = process.env.FEC_API_TIMEOUT_MS;
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

function getRetryConfig(): { retries: number; baseMs: number } {
  const rawRetries = process.env.FEC_RATE_LIMIT_RETRIES;
  const rawBaseMs = process.env.FEC_RATE_LIMIT_BASE_MS;
  const retries = rawRetries !== undefined ? Number(rawRetries) : NaN;
  const baseMs = rawBaseMs !== undefined ? Number(rawBaseMs) : NaN;
  return {
    retries: Number.isFinite(retries) && retries >= 0 ? retries : 3,
    baseMs: Number.isFinite(baseMs) && baseMs >= 0 ? baseMs : 1000,
  };
}

function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path: string, params: FecParams): string {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("api_key", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchFEC<T = unknown>(
  path: string,
  params: FecParams = {},
  timeoutMs = 30000
): Promise<T> {
  const url = buildUrl(path, params);
  const { retries, baseMs } = getRetryConfig();

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs(timeoutMs));

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
      if (typeof causeCode === "string" && causeCode.includes("CERT")) {
        throw new FecApiError(
          `TLS certificate error (${causeCode}) while connecting to the FEC API. ` +
            "This usually means a corporate SSL-inspecting proxy is intercepting the " +
            "connection with a certificate Node doesn't trust. Try running the server " +
            "with the --use-system-ca flag (e.g. `node --use-system-ca dist/index.js`) " +
            "so Node trusts the same certificates as the rest of the OS.",
          "UNAVAILABLE"
        );
      }
      throw new FecApiError(
        "FEC API unavailable: the request failed or timed out.",
        "UNAVAILABLE"
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      if (attempt < retries) {
        const retryAfterMs = parseRetryAfterMs(response.headers?.get?.("retry-after"));
        const backoffMs = baseMs * Math.pow(2, attempt) + Math.random() * baseMs;
        await sleep(retryAfterMs ?? backoffMs);
        continue;
      }
      throw new FecApiError(
        "FEC API rate limit exceeded. Try again shortly.",
        "RATE_LIMITED",
        429
      );
    }
    if (response.status >= 400 && response.status < 500) {
      const body = await response.json().catch(() => ({}) as Record<string, unknown>);
      const message =
        (body as { message?: string; error?: string }).message ||
        (body as { message?: string; error?: string }).error ||
        `FEC API rejected the request (status ${response.status}).`;
      throw new FecApiError(message, "BAD_REQUEST", response.status);
    }
    if (!response.ok) {
      throw new FecApiError("FEC API unavailable.", "UNAVAILABLE", response.status);
    }

    return (await response.json()) as T;
  }
}

function getMaxPage(): number {
  const raw = process.env.FEC_MAX_PAGE;
  if (!raw) return 10;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

// OpenFEC's schedule_a/schedule_b endpoints do not support deep page-based paging:
// requesting a page past an undocumented, unverified cutoff returns page 1 again with
// HTTP 200 and no error, silently corrupting anything that counts or aggregates rows.
// last_index keyset cursoring is the only reliable way to page deep into these endpoints.
export async function fetchPaginatedFEC<
  T extends { pagination?: { page?: unknown }; pagination_warning?: string } = {
    pagination?: { page?: unknown };
    pagination_warning?: string;
  },
>(path: string, params: FecParams, timeoutMs?: number): Promise<T> {
  const requestedPage = typeof params.page === "number" ? params.page : undefined;
  const maxPage = getMaxPage();

  if (requestedPage !== undefined && requestedPage > maxPage) {
    throw new Error(
      `page ${requestedPage} exceeds the maximum of ${maxPage} for this endpoint. FEC ` +
        "silently caps deep page-based paging here and returns page 1 again without an " +
        "error, so results beyond the cap would be duplicated rather than new. Use " +
        "last_index cursoring to page deeper, or raise FEC_MAX_PAGE if you have verified " +
        "the API accepts it."
    );
  }

  const data = await fetchFEC<T>(path, params, timeoutMs);

  if (
    requestedPage !== undefined &&
    data?.pagination?.page !== undefined &&
    Number(data.pagination.page) !== requestedPage
  ) {
    throw new Error(
      `FEC returned page ${data.pagination.page} for a request for page ${requestedPage}. ` +
        "This endpoint silently caps deep paging; the rows returned are NOT page " +
        `${requestedPage}. Use last_index cursoring instead.`
    );
  }

  if (requestedPage !== undefined && requestedPage > 1 && requestedPage <= maxPage) {
    data.pagination_warning =
      `Requested page ${requestedPage}. FEC's page-based paging is unreliable beyond the ` +
      "first few pages on this endpoint and may silently repeat page 1 without an error. " +
      "Prefer last_index cursoring for deep pagination.";
  }

  return data;
}
