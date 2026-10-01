import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { hasPaidFor } from "../orders/service.js";
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

type Viewer = { id: string; name: string } | null;

async function productIdFor(slug: string) {
  const productId = await repo.findProductId(slug);
  if (!productId) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
  return productId;
}

// Tells the product page which of four states to show, so it never offers a form that would fail.
export async function getEligibility(slug: string, viewer: Viewer) {
  const productId = await productIdFor(slug);
  if (!viewer) return { canReview: false, reason: "SIGN_IN" as const, myReview: null };
  const mine = await repo.findUserReview(productId, viewer.id);
  if (mine) return { canReview: false, reason: "ALREADY_REVIEWED" as const, myReview: mine };
  if (!(await hasPaidFor(viewer.id, productId))) return { canReview: false, reason: "NOT_PURCHASED" as const, myReview: null };
  return { canReview: true, reason: null, myReview: null };
}

export async function createReview(slug: string, viewer: Viewer, rating: number, body: string) {
  if (!viewer) throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in to write a review.");
  const productId = await productIdFor(slug);
  if (!(await hasPaidFor(viewer.id, productId))) {
    throw new AppError(403, "NOT_PURCHASED", "Only customers who bought this item can review it.");
  }
  const review = await repo.transaction(async (tx) => {
    await repo.lockProduct(tx, productId);
    const row = await repo.insertReview(tx, { productId, userId: viewer.id, authorName: viewer.name, rating, body });
    if (!row) throw new AppError(409, "ALREADY_REVIEWED", "You've already reviewed this item.");
    await repo.refreshRating(tx, productId);
    return row;
  });
  logger.info({ productId, userId: viewer.id }, "review_created");
  return review;
}
