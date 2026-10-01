import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db, pool } from "../src/db/index.js";
import { reviews } from "../src/db/schema.js";
import { createProduct, PG, pgErrorCode, resetDb } from "./helpers.js";

const app = createApp();

let productId: string;

// Five reviews with known ratings and dates: 5, 5, 4, 2 and 1 stars.
beforeAll(async () => {
  await resetDb();
  const product = await createProduct({ slug: "test-headphones" });
  productId = product.id;
  await createProduct({ slug: "no-reviews" });
  const day = (d: number) => new Date(Date.UTC(2025, 0, d));
  await db.insert(reviews).values([
    { productId, rating: 5, body: "Brilliant", authorName: "Ada", reviewedAt: day(5) },
    { productId, rating: 5, body: "Love them", authorName: "Ben", reviewedAt: day(1) },
    { productId, rating: 4, body: "Good value", authorName: "Cy", reviewedAt: day(4) },
    { productId, rating: 2, body: "Broke after a week", authorName: "Di", reviewedAt: day(3) },
    { productId, rating: 1, body: "Would not recommend!", authorName: "Ed", reviewedAt: day(2) },
  ]);
});
afterAll(() => pool.end());

describe("GET /products/:slug/reviews", () => {
  it("returns the average, a full five level breakdown and the newest reviews first", async () => {
    const res = await request(app).get("/products/test-headphones/reviews");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ average: 3.4, count: 5, total: 5, page: 1, pageSize: 10, stars: null, sort: "recent" });
    expect(res.body.breakdown).toEqual([
      { stars: 5, count: 2 },
      { stars: 4, count: 1 },
      { stars: 3, count: 0 },
      { stars: 2, count: 1 },
      { stars: 1, count: 1 },
    ]);
    expect(res.body.items.map((r: { body: string }) => r.body)).toEqual(["Brilliant", "Good value", "Broke after a week", "Would not recommend!", "Love them"]);
    expect(res.body.items[0]).toEqual({ id: expect.any(String), rating: 5, body: "Brilliant", authorName: "Ada", reviewedAt: "2025-01-05T00:00:00.000Z" });
  });

  it("filters by star level while the breakdown still covers every review", async () => {
    const res = await request(app).get("/products/test-headphones/reviews?stars=5");
    expect(res.body.items.map((r: { authorName: string }) => r.authorName)).toEqual(["Ada", "Ben"]);
    expect(res.body).toMatchObject({ total: 2, count: 5, stars: 5 });
  });

  it("sorts by highest and lowest rating", async () => {
    const high = await request(app).get("/products/test-headphones/reviews?sort=highest");
    expect(high.body.items.map((r: { rating: number }) => r.rating)).toEqual([5, 5, 4, 2, 1]);
    const low = await request(app).get("/products/test-headphones/reviews?sort=lowest");
    expect(low.body.items.map((r: { rating: number }) => r.rating)).toEqual([1, 2, 4, 5, 5]);
  });

  it("pages without repeats", async () => {
    const one = await request(app).get("/products/test-headphones/reviews?pageSize=2&page=1");
    const two = await request(app).get("/products/test-headphones/reviews?pageSize=2&page=2");
    const three = await request(app).get("/products/test-headphones/reviews?pageSize=2&page=3");
    const ids = [...one.body.items, ...two.body.items, ...three.body.items].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("gives a product without reviews an empty but complete answer", async () => {
    const res = await request(app).get("/products/no-reviews/reviews");
    expect(res.body).toMatchObject({ average: 0, count: 0, items: [], total: 0 });
    expect(res.body.breakdown).toHaveLength(5);
  });

  it("returns 404 for an unknown product and 400 for bad input", async () => {
    expect((await request(app).get("/products/nope/reviews")).status).toBe(404);
    for (const q of ["stars=6", "stars=0", "sort=best", "pageSize=50"]) {
      expect((await request(app).get(`/products/test-headphones/reviews?${q}`)).status).toBe(400);
    }
  });

  it("refuses a rating outside 1 to 5 at the database", async () => {
    const insert = db.insert(reviews).values({ productId, rating: 6, body: "x", authorName: "x", reviewedAt: new Date() });
    expect(await pgErrorCode(insert)).toBe(PG.checkViolation);
  });
});
