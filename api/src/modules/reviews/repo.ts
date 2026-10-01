import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { products, reviews } from "../../db/schema.js";

export type ReviewSort = "recent" | "highest" | "lowest";

export async function findProductId(slug: string) {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row?.id;
}

// Counts per star level for the histogram; always over all reviews, whatever filter is applied.
export async function starCounts(productId: string) {
  return db
    .select({ stars: reviews.rating, count: count() })
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .groupBy(reviews.rating);
}

export async function listReviews(productId: string, stars: number | undefined, sort: ReviewSort, limit: number, offset: number) {
  const where = and(eq(reviews.productId, productId), stars ? eq(reviews.rating, stars) : undefined);
  const order: SQL[] =
    sort === "highest"
      ? [desc(reviews.rating), desc(reviews.reviewedAt)]
      : sort === "lowest"
        ? [asc(reviews.rating), desc(reviews.reviewedAt)]
        : [desc(reviews.reviewedAt)];
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, authorName: reviews.authorName, reviewedAt: reviews.reviewedAt })
      .from(reviews)
      .where(where)
      // id last so equal dates never swap places between pages.
      .orderBy(...order, asc(reviews.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(reviews).where(where),
  ]);
  return { rows, total: totalRow?.total ?? 0 };
}
