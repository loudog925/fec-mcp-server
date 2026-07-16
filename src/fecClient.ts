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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs(timeoutMs));

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch {
    throw new FecApiError(
      "FEC API unavailable: the request failed or timed out.",
      "UNAVAILABLE"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
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
