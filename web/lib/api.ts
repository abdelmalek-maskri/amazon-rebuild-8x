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
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "TIMEOUT", "The store took too long to respond. Please try again.");
    }
    // fetch reports network failures as TypeError. Anything else must pass through untouched:
    // Next.js throws its own signal from fetch to stop prerendering, and swallowing it breaks the build.
    if (err instanceof TypeError) {
      throw new ApiError(0, "NETWORK_ERROR", "We couldn't reach the store. Check your connection and try again.");
    }
    throw err;
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

export type Category = { slug: string; name: string; productCount: number };

export type Availability =
  | { status: "in_stock" }
  | { status: "low_stock"; left: number }
  | { status: "out_of_stock" };

export type ProductSummary = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  priceCents: number;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  availability: Availability;
};

export type ProductSort = "relevance" | "featured" | "price_asc" | "price_desc" | "rating" | "newest";

export type ProductQuery = {
  q?: string;
  category?: string;
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
};

export type ProductPage = {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  sort: ProductSort;
  facets: {
    categories: { slug: string; name: string; count: number }[];
    brands: { name: string; count: number }[];
    ratings: { min: number; count: number }[];
  };
};

export function getCategories() {
  return apiFetch<{ items: Category[] }>("/categories");
}

export function searchProducts(query: ProductQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === false) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const qs = params.toString();
  return apiFetch<ProductPage>(`/products${qs ? `?${qs}` : ""}`);
}
