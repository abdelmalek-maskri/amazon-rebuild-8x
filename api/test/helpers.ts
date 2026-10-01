import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { categories, products } from "../src/db/schema.js";

export async function resetDb() {
  await db.execute(sql`truncate categories, products, carts, cart_items, orders, order_items restart identity cascade`);
}

export async function createCategory(overrides: Partial<typeof categories.$inferInsert> = {}) {
  const [category] = await db
    .insert(categories)
    .values({ slug: `cat-${crypto.randomUUID()}`, name: "Test category", ...overrides })
    .returning();
  return category!;
}

export async function createProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
  const [product] = await db
    .insert(products)
    .values({
      slug: `product-${crypto.randomUUID()}`,
      title: "Test product",
      description: "A product for tests",
      categoryId: overrides.categoryId ?? (await createCategory()).id,
      priceCents: 1999,
      stock: 5,
      imageUrl: "https://example.com/p.webp",
      ...overrides,
    })
    .returning();
  return product!;
}

// Postgres error codes, so a test asserts the exact constraint that fired, not just "it threw".
export const PG = { uniqueViolation: "23505", foreignKeyViolation: "23503", checkViolation: "23514" } as const;

export async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    // Drizzle wraps the driver error; the Postgres code sits on the cause.
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  throw new Error("expected the query to fail, but it succeeded");
}
