import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/index.js";
import { wishlistItems } from "../src/db/schema.js";
import { closeServers, createProduct, resetDb, serve } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await closeServers();
  await pool.end();
});

async function shopper(email = "ada@example.com") {
  const agent = request.agent(serve());
  await agent.post("/auth/signup").send({ email, name: "Ada", password: "a long password" }).expect(201);
  return agent;
}

const ids = (body: { items: { product: { id: string } }[] }) => body.items.map((i) => i.product.id);

describe("wishlist", () => {
  it("is for accounts only", async () => {
    const product = await createProduct();
    const anon = request(serve());
    expect((await anon.get("/wishlist")).status).toBe(401);
    expect((await anon.post("/wishlist/items").send({ productId: product.id })).body.error).toBe("SIGN_IN_REQUIRED");
    // The product page asks too; a guest simply hasn't saved anything.
    expect((await anon.get(`/wishlist/status/${product.id}`)).body).toEqual({ saved: false });
  });

  it("saves, lists newest first, and ignores saving the same item twice", async () => {
    const first = await createProduct({ stock: 50 });
    const second = await createProduct({ stock: 2 });
    const agent = await shopper();
    await agent.post("/wishlist/items").send({ productId: first.id }).expect(201);
    await agent.post("/wishlist/items").send({ productId: second.id }).expect(201);
    const again = await agent.post("/wishlist/items").send({ productId: first.id });
    expect(again.status).toBe(201);
    expect(ids(again.body)).toEqual([second.id, first.id]);
    expect(again.body.items[0].product.availability).toEqual({ status: "low_stock", left: 2 });
    expect(again.body.items[0].product).not.toHaveProperty("stock");
    expect(await db.select().from(wishlistItems)).toHaveLength(2);
    expect((await agent.get(`/wishlist/status/${first.id}`)).body).toEqual({ saved: true });
  });

  it("removes an item, and says so when it isn't there", async () => {
    const product = await createProduct();
    const agent = await shopper();
    await agent.post("/wishlist/items").send({ productId: product.id }).expect(201);
    const res = await agent.delete(`/wishlist/items/${product.id}`);
    expect(res.body).toEqual({ items: [], total: 0 });
    expect((await agent.delete(`/wishlist/items/${product.id}`)).status).toBe(404);
  });

  it("moves an item to the basket and off the list", async () => {
    const product = await createProduct({ stock: 5 });
    const agent = await shopper();
    await agent.post("/wishlist/items").send({ productId: product.id }).expect(201);
    const res = await agent.post(`/wishlist/items/${product.id}/move-to-basket`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect((await agent.get("/cart")).body).toMatchObject({ itemCount: 1 });
  });

  it("keeps an out of stock item saved when the basket refuses it", async () => {
    const product = await createProduct({ stock: 0 });
    const agent = await shopper();
    await agent.post("/wishlist/items").send({ productId: product.id }).expect(201);
    const res = await agent.post(`/wishlist/items/${product.id}/move-to-basket`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OUT_OF_STOCK");
    expect(ids((await agent.get("/wishlist")).body)).toEqual([product.id]);
    expect((await agent.get("/cart")).body.itemCount).toBe(0);
  });

  it("keeps every shopper's list private", async () => {
    const product = await createProduct();
    const ada = await shopper("ada@example.com");
    const bob = await shopper("bob@example.com");
    await ada.post("/wishlist/items").send({ productId: product.id }).expect(201);
    expect((await bob.get("/wishlist")).body.total).toBe(0);
    expect((await bob.delete(`/wishlist/items/${product.id}`)).status).toBe(404);
    expect((await bob.post(`/wishlist/items/${product.id}/move-to-basket`)).status).toBe(404);
    expect((await ada.get("/wishlist")).body.total).toBe(1);
  });

  it("rejects unknown products and malformed ids", async () => {
    const agent = await shopper();
    expect((await agent.post("/wishlist/items").send({ productId: crypto.randomUUID() })).status).toBe(404);
    expect((await agent.post("/wishlist/items").send({ productId: "nope" })).status).toBe(400);
    expect((await agent.delete("/wishlist/items/nope")).status).toBe(400);
  });
});
