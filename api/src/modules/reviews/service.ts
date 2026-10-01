import { AppError } from "../../lib/errors.js";
import * as repo from "./repo.js";

export async function getReviews(slug: string, stars: number | undefined, sort: repo.ReviewSort, page: number, pageSize: number) {
  const productId = await repo.findProductId(slug);
  if (!productId) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");

  const [counts, { rows, total }] = await Promise.all([
    repo.starCounts(productId),
    repo.listReviews(productId, stars, sort, pageSize, (page - 1) * pageSize),
  ]);

  // All five levels always present, highest first, so the histogram never has gaps.
  const byStars = new Map(counts.map((c) => [c.stars, c.count]));
  const breakdown = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: byStars.get(s) ?? 0 }));
  const count = breakdown.reduce((n, b) => n + b.count, 0);
  const average = count ? Math.round((breakdown.reduce((n, b) => n + b.stars * b.count, 0) / count) * 10) / 10 : 0;

  return { average, count, breakdown, items: rows, total, page, pageSize, stars: stars ?? null, sort };
}
