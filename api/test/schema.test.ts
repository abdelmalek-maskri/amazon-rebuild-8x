import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/index.js";
import { cartItems, carts, orderItems, orders, products } from "../src/db/schema.js";
import { createProduct, PG, pgErrorCode, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(() => pool.end());

describe("database constraints", () => {
  it("rejects a negative price or stock", async () => {
    expect(await pgErrorCode(createProduct({ priceCents: -1 }))).toBe(PG.checkViolation);
    expect(await pgErrorCode(createProduct({ stock: -1 }))).toBe(PG.checkViolation);
  });

  it("keeps cart quantities between 1 and 10", async () => {
    const product = await createProduct();
    const [cart] = await db.insert(carts).values({}).returning();
    for (const quantity of [0, 11]) {
      const insert = db.insert(cartItems).values({ cartId: cart!.id, productId: product.id, quantity });
      expect(await pgErrorCode(insert)).toBe(PG.checkViolation);
    }
  });

  it("allows one line per product per cart", async () => {
    const product = await createProduct();
    const [cart] = await db.insert(carts).values({}).returning();
    await db.insert(cartItems).values({ cartId: cart!.id, productId: product.id, quantity: 1 });
    const again = db.insert(cartItems).values({ cartId: cart!.id, productId: product.id, quantity: 2 });
    expect(await pgErrorCode(again)).toBe(PG.uniqueViolation);
  });

  it("never lets a purchased product be deleted", async () => {
    const product = await createProduct();
    const [order] = await db.insert(orders).values({ totalCents: 1999 }).returning();
    await db
      .insert(orderItems)
      .values({ orderId: order!.id, productId: product.id, title: product.title, unitPriceCents: 1999, quantity: 1 });
    expect(await pgErrorCode(db.delete(products).where(eq(products.id, product.id)))).toBe(PG.foreignKeyViolation);
  });

  it("deleting a cart removes its lines but keeps the order", async () => {
    const product = await createProduct();
    const [cart] = await db.insert(carts).values({}).returning();
    await db.insert(cartItems).values({ cartId: cart!.id, productId: product.id, quantity: 1 });
    const [order] = await db.insert(orders).values({ cartId: cart!.id, totalCents: 1999 }).returning();

    await db.delete(carts).where(eq(carts.id, cart!.id));

    expect(await db.select().from(cartItems)).toHaveLength(0);
    const [kept] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(kept!.cartId).toBeNull();
  });

  it("gives each Stripe session to at most one order", async () => {
    await db.insert(orders).values({ totalCents: 100, stripeSessionId: "cs_test_1" });
    const dup = db.insert(orders).values({ totalCents: 100, stripeSessionId: "cs_test_1" });
    expect(await pgErrorCode(dup)).toBe(PG.uniqueViolation);
  });
});
