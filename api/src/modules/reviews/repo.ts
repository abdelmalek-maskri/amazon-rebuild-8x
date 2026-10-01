import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { products, reviews } from "../../db/schema.js";

export type ReviewSort = "recent" | "highest" | "lowest";

export async function findProductId(slug: string) {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row?.id;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return db.transaction(fn);
}

export async function findUserReview(productId: string, userId: string) {
  const [row] = await db
    .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, reviewedAt: reviews.reviewedAt })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)));
  return row;
}

// Locks the product row so two reviews landing at once can't both write a stale average.
export async function lockProduct(tx: Tx, productId: string) {
  await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for("update");
}

// Returns undefined if this shopper already reviewed the product (the unique constraint decides).
export async function insertReview(tx: Tx, review: { productId: string; userId: string; authorName: string; rating: number; body: string }) {
  const [row] = await tx
    .insert(reviews)
    .values({ ...review, verified: true, reviewedAt: new Date() })
    .onConflictDoNothing({ target: [reviews.productId, reviews.userId] })
    .returning({ id: reviews.id, rating: reviews.rating, body: reviews.body, authorName: reviews.authorName, reviewedAt: reviews.reviewedAt, verified: reviews.verified });
  return row;
}

// Recomputed from the stored reviews, never adjusted incrementally, so it can't drift.
export async function refreshRating(tx: Tx, productId: string) {
  await tx
    .update(products)
    .set({
      ratingAvg: sql`coalesce((select round(avg(${reviews.rating})::numeric, 1) from ${reviews} where ${reviews.productId} = ${productId}), 0)`,
      ratingCount: sql`(select count(*) from ${reviews} where ${reviews.productId} = ${productId})`,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
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
      .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, authorName: reviews.authorName, reviewedAt: reviews.reviewedAt, verified: reviews.verified })
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
