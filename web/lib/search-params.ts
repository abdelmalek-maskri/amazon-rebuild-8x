import type { ProductQuery, ProductSort } from "@/lib/api";

// The URL is the single source of truth for search state: shareable, bookmarkable, back button friendly.
export type SearchState = {
  q?: string;
  category?: string;
  brand: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock: boolean;
  sort?: ProductSort;
  page: number;
};

export const PAGE_SIZE = 24;

const SORTS: ProductSort[] = ["relevance", "featured", "price_asc", "price_desc", "rating", "newest"];

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function int(v: string | undefined, min: number, max: number) {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

// Hand edited or stale URLs are cleaned rather than sent on: a bad value is dropped, never a 400 page.
export function parseSearchParams(raw: RawParams): SearchState {
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;
  const category = first(raw.category);
  const sort = first(raw.sort) as ProductSort | undefined;
  let minPrice = int(first(raw.minPrice), 0, 10_000_000);
  let maxPrice = int(first(raw.maxPrice), 0, 10_000_000);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    q,
    category: category && /^[a-z0-9-]{1,60}$/.test(category) ? category : undefined,
    brand: [...new Set(all(raw.brand).map((b) => b.trim()).filter((b) => b && b.length <= 60))].slice(0, 20),
    minPrice,
    maxPrice,
    minRating: int(first(raw.minRating), 1, 4),
    inStock: first(raw.inStock) === "true",
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: int(first(raw.page), 1, 500) ?? 1,
  };
}

export function toProductQuery(s: SearchState): ProductQuery {
  return { ...s, pageSize: PAGE_SIZE };
}

// Any change except paging sends the shopper back to page 1: page 3 of the old results means nothing now.
export function searchHref(s: SearchState, patch: Partial<SearchState> = {}) {
  const next = { ...s, page: 1, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.category) p.set("category", next.category);
  for (const b of next.brand) p.append("brand", b);
  if (next.minPrice !== undefined) p.set("minPrice", String(next.minPrice));
  if (next.maxPrice !== undefined) p.set("maxPrice", String(next.maxPrice));
  if (next.minRating !== undefined) p.set("minRating", String(next.minRating));
  if (next.inStock) p.set("inStock", "true");
  if (next.sort) p.set("sort", next.sort);
  if (next.page > 1) p.set("page", String(next.page));
  const qs = p.toString();
  return `/search${qs ? `?${qs}` : ""}`;
}

export function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export const PRICE_RANGES: { label: string; min?: number; max?: number }[] = [
  { label: "Under $25", max: 2500 },
  { label: "$25 to $50", min: 2500, max: 5000 },
  { label: "$50 to $100", min: 5000, max: 10000 },
  { label: "$100 to $200", min: 10000, max: 20000 },
  { label: "$200 & above", min: 20000 },
];

export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Best match",
  featured: "Featured",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Avg. customer review",
  newest: "Newest arrivals",
};

export function activeFilterCount(s: SearchState) {
  return (
    (s.category ? 1 : 0) +
    s.brand.length +
    (s.minPrice !== undefined || s.maxPrice !== undefined ? 1 : 0) +
    (s.minRating !== undefined ? 1 : 0) +
    (s.inStock ? 1 : 0)
  );
}
