import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { products, wishlistItems } from "../../db/schema.js";

export async function productExists(productId: string) {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  return Boolean(row);
}

export async function list(userId: string) {
  return db
    .select({
      addedAt: wishlistItems.createdAt,
      product: {
        id: products.id,
        slug: products.slug,
        title: products.title,
        brand: products.brand,
        imageUrl: products.imageUrl,
        priceCents: products.priceCents,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        stock: products.stock,
      },
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt), asc(wishlistItems.id));
}

// Saving twice is a no-op: the unique constraint absorbs it.
export async function add(userId: string, productId: string) {
  await db.insert(wishlistItems).values({ userId, productId }).onConflictDoNothing({ target: [wishlistItems.userId, wishlistItems.productId] });
}

export async function remove(userId: string, productId: string) {
  const deleted = await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)))
    .returning({ id: wishlistItems.id });
  return deleted.length > 0;
}

export async function contains(userId: string, productId: string) {
  const [row] = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  return Boolean(row);
}
