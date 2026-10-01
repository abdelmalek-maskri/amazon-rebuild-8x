import { AppError } from "../../lib/errors.js";
import * as repo from "./repo.js";

export const LOW_STOCK = 5;

// Shoppers see "in stock", "only N left" or "out of stock", never the raw count:
// exact inventory is business data a competitor could scrape.
export function availability(stock: number) {
  if (stock <= 0) return { status: "out_of_stock" as const };
  if (stock <= LOW_STOCK) return { status: "low_stock" as const, left: stock };
  return { status: "in_stock" as const };
}

function toSummary({ stock, ...p }: Awaited<ReturnType<typeof repo.listProducts>>["rows"][number]) {
  return { ...p, availability: availability(stock) };
}

export async function searchProducts(
  filters: repo.ProductFilters,
  sort: repo.ProductSort | undefined,
  page: number,
  pageSize: number,
) {
  // Relevance only means something with a query; otherwise default to the featured order.
  const effectiveSort = sort ?? (filters.q ? "relevance" : "featured");
  const [{ rows, total }, facets] = await Promise.all([
    repo.listProducts(filters, effectiveSort, pageSize, (page - 1) * pageSize),
    repo.productFacets(filters),
  ]);
  return { items: rows.map(toSummary), total, page, pageSize, sort: effectiveSort, facets };
}

export async function getProduct(slug: string) {
  const row = await repo.findProductBySlug(slug);
  if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
  const { stock, ...p } = row;
  return { ...p, availability: availability(stock) };
}

export async function getCategories() {
  return { items: await repo.listCategories() };
}
