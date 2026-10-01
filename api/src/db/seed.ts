import { readFileSync } from "node:fs";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { db, pool } from "./index.js";
import { categories, products, reviews } from "./schema.js";

// api/data/products.json, reachable from both src/db (tsx) and dist/db (compiled).
const SNAPSHOT = new URL("../../data/products.json", import.meta.url);

const Snapshot = z.object({
  categories: z.array(z.object({ slug: z.string().min(1), name: z.string().min(1) })).min(1),
  products: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(1),
        description: z.string(),
        brand: z.string().nullable(),
        category: z.string(),
        priceCents: z.number().int().nonnegative(),
        stock: z.number().int().nonnegative(),
        thumbnail: z.url(),
        images: z.array(z.url()),
        reviews: z.array(
          z.object({
            rating: z.number().int().min(1).max(5),
            comment: z.string().min(1),
            date: z.iso.datetime(),
            reviewerName: z.string().min(1),
          }),
        ),
      }),
    )
    .min(1),
});

try {
  const snapshot = Snapshot.parse(JSON.parse(readFileSync(SNAPSHOT, "utf8")));

  const inserted = await db.transaction(async (tx) => {
    // Insert only what is missing: re-running on every deploy must never reset stock that sales have moved.
    await tx.insert(categories).values(snapshot.categories).onConflictDoNothing({ target: categories.slug });
    const categoryId = new Map((await tx.select().from(categories)).map((c) => [c.slug, c.id]));

    const rows = snapshot.products.map((p) => {
      const id = categoryId.get(p.category);
      if (!id) throw new Error(`product ${p.slug} has unknown category ${p.category}`);
      const sum = p.reviews.reduce((s, r) => s + r.rating, 0);
      return {
        slug: p.slug,
        title: p.title,
        description: p.description,
        brand: p.brand,
        categoryId: id,
        priceCents: p.priceCents,
        stock: p.stock,
        imageUrl: p.thumbnail,
        images: p.images,
        // From the reviews we actually store, so the stars always agree with the reviews shown.
        ratingAvg: p.reviews.length ? Math.round((sum / p.reviews.length) * 10) / 10 : 0,
        ratingCount: p.reviews.length,
      };
    });
    const added = await tx.insert(products).values(rows).onConflictDoNothing({ target: products.slug }).returning({ id: products.id });

    // Reviews only for products that have none yet, so re-runs never duplicate them.
    const productId = new Map((await tx.select({ id: products.id, slug: products.slug }).from(products)).map((p) => [p.slug, p.id]));
    const reviewed = new Set((await tx.selectDistinct({ productId: reviews.productId }).from(reviews)).map((r) => r.productId));
    const reviewRows = snapshot.products.flatMap((p) => {
      const id = productId.get(p.slug);
      if (!id || reviewed.has(id)) return [];
      return p.reviews.map((r) => ({ productId: id, rating: r.rating, body: r.comment, authorName: r.reviewerName, reviewedAt: new Date(r.date) }));
    });
    if (reviewRows.length) await tx.insert(reviews).values(reviewRows);
    return { products: added.length, reviews: reviewRows.length };
  });

  logger.info({ inserted: inserted.products, reviewsInserted: inserted.reviews, inSnapshot: snapshot.products.length }, "seed complete");
} catch (err) {
  logger.error({ err }, "seed failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
