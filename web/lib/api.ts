// Every call to the API goes through here. Pages and components never call fetch directly.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

function baseUrl() {
  // In the browser, go through our own /api rewrite. On the server, call the API directly.
  if (typeof window !== "undefined") return "/api";
  const url = process.env.API_URL;
  if (!url) throw new Error("API_URL is not set");
  return url.replace(/\/$/, "");
}

function isErrorBody(body: unknown): body is { error: string; message: string; fields?: ApiError["fields"] } {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: unknown }).error === "string" &&
    typeof (body as { message?: unknown }).message === "string"
  );
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      // Without this, Next fetches once at build time and bakes the answer into the page.
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiError(
      0,
      timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      timedOut ? "The store took too long to respond. Please try again." : "We couldn't reach the store. Check your connection and try again.",
    );
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isErrorBody(body)) throw new ApiError(res.status, body.error, body.message, body.fields);
    throw new ApiError(res.status, "UNEXPECTED_RESPONSE", "Something went wrong on our side. Please try again.");
  }
  return body as T;
}

export type Health = { status: "ok" | "error"; db: "ok" | "down" };

export function getHealth() {
  return apiFetch<Health>("/health");
}
