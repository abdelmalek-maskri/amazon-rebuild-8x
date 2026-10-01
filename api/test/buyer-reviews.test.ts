import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/index.js";
import { orderItems, orders, products, reviews, users } from "../src/db/schema.js";
import { closeServers, createProduct, resetDb, serve } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await closeServers();
  await pool.end();
});

const good = { rating: 4, body: "Comfortable and the battery lasts all week." };

async function shopper(email = "ada@example.com", name = "Ada") {
  const agent = request.agent(serve());
  await agent.post("/auth/signup").send({ email, name, password: "a long password" }).expect(201);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return { agent, userId: user!.id };
}

// A finished order straight in the database; the payment path itself is covered in orders.test.ts.
async function orderFor(userId: string, productId: string, status: "paid" | "refunded" | "cancelled" | "pending" = "paid") {
  const [order] = await db.insert(orders).values({ userId, status, totalCents: 1000, paidAt: status === "pending" ? null : new Date() }).returning();
  await db.insert(orderItems).values({ orderId: order!.id, productId, title: "Test product", unitPriceCents: 1000, quantity: 1 });
}

describe("buyer-only reviews", () => {
  it("asks guests to sign in, and refuses their review", async () => {
    const product = await createProduct({ slug: "headphones" });
    const anon = request(serve());
    expect((await anon.get(`/products/${product.slug}/reviews/eligibility`)).body).toEqual({ canReview: false, reason: "SIGN_IN", myReview: null });
    const res = await anon.post(`/products/${product.slug}/reviews`).send(good);
    expect(res.status).toBe(401);
  });

  it("refuses a signed in shopper who hasn't bought it", async () => {
    const product = await createProduct({ slug: "headphones" });
    const { agent } = await shopper();
    expect((await agent.get(`/products/${product.slug}/reviews/eligibility`)).body.reason).toBe("NOT_PURCHASED");
    const res = await agent.post(`/products/${product.slug}/reviews`).send(good);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NOT_PURCHASED");
  });

  it.each(["refunded", "cancelled", "pending"] as const)("doesn't count a %s order as a purchase", async (status) => {
    const product = await createProduct({ slug: "headphones" });
    const { agent, userId } = await shopper();
    await orderFor(userId, product.id, status);
    expect((await agent.post(`/products/${product.slug}/reviews`).send(good)).status).toBe(403);
  });

  it("lets a buyer review once, marks it verified and updates the product's rating", async () => {
    const product = await createProduct({ slug: "headphones", ratingAvg: 0, ratingCount: 0 });
    await db.insert(reviews).values({ productId: product.id, rating: 2, body: "Seeded", authorName: "Old", reviewedAt: new Date(2025, 0, 1) });
    const { agent, userId } = await shopper();
    await orderFor(userId, product.id);
    expect((await agent.get(`/products/${product.slug}/reviews/eligibility`)).body).toEqual({ canReview: true, reason: null, myReview: null });

    const res = await agent.post(`/products/${product.slug}/reviews`).send({ ...good, body: `  ${good.body}  ` });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ rating: 4, body: good.body, authorName: "Ada", verified: true });

    const [row] = await db.select().from(products).where(eq(products.id, product.id));
    expect(row!.ratingCount).toBe(2);
    expect(row!.ratingAvg).toBeCloseTo(3, 5);

    const list = (await agent.get(`/products/${product.slug}/reviews`)).body;
    expect(list.items[0]).toMatchObject({ authorName: "Ada", verified: true });
    expect(list.items[1]).toMatchObject({ authorName: "Old", verified: false });
    expect(list.average).toBe(3);

    const again = await agent.post(`/products/${product.slug}/reviews`).send(good);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("ALREADY_REVIEWED");
    expect((await agent.get(`/products/${product.slug}/reviews/eligibility`)).body).toMatchObject({ reason: "ALREADY_REVIEWED", myReview: { rating: 4 } });
  });

  it("keeps one review per shopper even when two arrive at once", async () => {
    const product = await createProduct({ slug: "headphones" });
    const { agent, userId } = await shopper();
    await orderFor(userId, product.id);
    const results = await Promise.all([agent.post(`/products/${product.slug}/reviews`).send(good), agent.post(`/products/${product.slug}/reviews`).send(good)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(reviews).where(eq(reviews.productId, product.id))).toHaveLength(1);
  });

  it.each([
    [{ rating: 0, body: good.body }, "rating"],
    [{ rating: 6, body: good.body }, "rating"],
    [{ rating: 4.5, body: good.body }, "rating"],
    [{ rating: 4, body: "too short" }, "body"],
    [{ rating: 4, body: "          " }, "body"],
    [{ rating: 4, body: "x".repeat(2001) }, "body"],
  ])("rejects %o with 400", async (body, field) => {
    const product = await createProduct({ slug: "headphones" });
    const { agent, userId } = await shopper();
    await orderFor(userId, product.id);
    const res = await agent.post(`/products/${product.slug}/reviews`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it("returns 404 for an unknown product", async () => {
    const { agent } = await shopper();
    expect((await agent.post("/products/no-such-thing/reviews").send(good)).status).toBe(404);
  });
});
