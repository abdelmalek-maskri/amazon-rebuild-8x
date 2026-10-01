import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db, pool } from "../src/db/index.js";
import { products } from "../src/db/schema.js";
import { createProduct, resetDb } from "./helpers.js";

const app = createApp();

beforeEach(resetDb);
afterAll(() => pool.end());

// An agent keeps cookies between requests, like one shopper's browser.
const shopper = () => request.agent(app);

describe("cart", () => {
  it("is empty for a new visitor, without creating anything", async () => {
    const res = await request(app).get("/cart");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], itemCount: 0, subtotalCents: 0 });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("creates a cart on the first add and remembers it in a locked down cookie", async () => {
    const product = await createProduct({ priceCents: 1999, stock: 5 });
    const res = await request(app).post("/cart/items").send({ productId: product.id, quantity: 2 });
    expect(res.status).toBe(201);
    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/^cart_id=[0-9a-f-]{36};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.body).toMatchObject({ itemCount: 2, subtotalCents: 3998 });
    expect(res.body.items[0]).toMatchObject({ quantity: 2, lineTotalCents: 3998, maxQuantity: 5 });
    expect(res.body.items[0].product).not.toHaveProperty("stock");
    expect(res.body.items[0].product.description).toBe("A product for tests");
    expect(res.body.items[0].product.categorySlug).toMatch(/^cat-/);
  });

  it("merges a second add of the same product into one line", async () => {
    const product = await createProduct({ stock: 10 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 2 });
    const res = await agent.post("/cart/items").send({ productId: product.id, quantity: 3 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(5);
  });

  it("prices every read from the database, not from what was in the cart", async () => {
    const product = await createProduct({ priceCents: 1000, stock: 5 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 3 });
    await db.update(products).set({ priceCents: 1250 }).where(eq(products.id, product.id));
    const res = await agent.get("/cart");
    expect(res.body.subtotalCents).toBe(3750);
  });

  it("refuses more than is in stock and leaves the cart unchanged", async () => {
    const product = await createProduct({ stock: 3 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 2 });
    const res = await agent.post("/cart/items").send({ productId: product.id, quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "QUANTITY_UNAVAILABLE", message: "Only 3 of this item are available." });
    expect((await agent.get("/cart")).body.items[0].quantity).toBe(2);
  });

  it("caps a line at 10 even when more are in stock", async () => {
    const product = await createProduct({ stock: 50 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 8 });
    const res = await agent.post("/cart/items").send({ productId: product.id, quantity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("QUANTITY_LIMIT");
  });

  it("refuses out of stock and unknown products", async () => {
    const soldOut = await createProduct({ stock: 0 });
    const out = await request(app).post("/cart/items").send({ productId: soldOut.id });
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("OUT_OF_STOCK");
    const missing = await request(app).post("/cart/items").send({ productId: crypto.randomUUID() });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("PRODUCT_NOT_FOUND");
  });

  it.each([
    [{ productId: "not-a-uuid" }, "productId"],
    [{ productId: crypto.randomUUID(), quantity: 0 }, "quantity"],
    [{ productId: crypto.randomUUID(), quantity: 11 }, "quantity"],
    [{ productId: crypto.randomUUID(), quantity: 1.5 }, "quantity"],
    [{ productId: crypto.randomUUID(), quantity: "2" }, "quantity"],
  ])("rejects %o with 400", async (body, field) => {
    const res = await request(app).post("/cart/items").send(body);
    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it("ignores a body that isn't JSON, so a cross-site form can't add items", async () => {
    const product = await createProduct();
    const res = await request(app).post("/cart/items").type("form").send({ productId: product.id });
    expect(res.status).toBe(400);
  });

  it("updates and removes lines, recomputing totals", async () => {
    const product = await createProduct({ priceCents: 500, stock: 10 });
    const agent = shopper();
    const added = await agent.post("/cart/items").send({ productId: product.id, quantity: 1 });
    const itemId = added.body.items[0].id;

    const updated = await agent.patch(`/cart/items/${itemId}`).send({ quantity: 4 });
    expect(updated.body).toMatchObject({ itemCount: 4, subtotalCents: 2000 });

    const tooMany = await agent.patch(`/cart/items/${itemId}`).send({ quantity: 11 });
    expect(tooMany.status).toBe(400);

    const removed = await agent.delete(`/cart/items/${itemId}`);
    expect(removed.body).toEqual({ items: [], itemCount: 0, subtotalCents: 0 });
  });

  it("returns 404 for a line in someone else's cart, and never touches it", async () => {
    const product = await createProduct({ stock: 10 });
    const alice = shopper();
    const bob = shopper();
    const added = await alice.post("/cart/items").send({ productId: product.id, quantity: 1 });
    const aliceItem = added.body.items[0].id;
    await bob.post("/cart/items").send({ productId: product.id, quantity: 1 });

    expect((await bob.patch(`/cart/items/${aliceItem}`).send({ quantity: 5 })).status).toBe(404);
    expect((await bob.delete(`/cart/items/${aliceItem}`)).status).toBe(404);
    expect((await request(app).delete(`/cart/items/${aliceItem}`)).status).toBe(404);
    expect((await alice.get("/cart")).body.items[0].quantity).toBe(1);
  });

  it("treats a forged or stale cookie as no cart, then starts a fresh one", async () => {
    const product = await createProduct();
    const garbage = await request(app).get("/cart").set("Cookie", "cart_id=' OR 1=1 --");
    expect(garbage.status).toBe(200);
    expect(garbage.body.items).toEqual([]);

    const stale = crypto.randomUUID();
    const res = await request(app).post("/cart/items").set("Cookie", `cart_id=${stale}`).send({ productId: product.id });
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]![0]).not.toContain(stale);
  });

  it("never sells more than the stock when two adds race", async () => {
    const product = await createProduct({ stock: 3 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 1 });
    // Both want 2 more on top of 1; only one can fit within the stock of 3.
    const results = await Promise.all([
      agent.post("/cart/items").send({ productId: product.id, quantity: 2 }),
      agent.post("/cart/items").send({ productId: product.id, quantity: 2 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await agent.get("/cart")).body.items[0].quantity).toBe(3);
  });
});
