import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/index.js";
import { categories, products, reviews } from "../src/db/schema.js";
import { resetDb } from "./helpers.js";

const snapshot = JSON.parse(readFileSync(new URL("../data/products.json", import.meta.url), "utf8"));

// The seed is a script with top level side effects, so run it the way deploys do: as its own process.
function runSeed() {
  execFileSync("npx", ["tsx", "src/db/seed.ts"], { env: process.env, stdio: "pipe" });
}

beforeAll(async () => {
  await resetDb();
  runSeed();
});
afterAll(() => pool.end());

describe("seed", () => {
  it("loads every category and product from the snapshot", async () => {
    const [{ count: productCount }] = (await db.select({ count: sql<number>`count(*)::int` }).from(products)) as [{ count: number }];
    const [{ count: categoryCount }] = (await db.select({ count: sql<number>`count(*)::int` }).from(categories)) as [{ count: number }];
    expect(productCount).toBe(snapshot.products.length);
    expect(categoryCount).toBe(snapshot.categories.length);
  });

  it("derives the rating from the stored reviews", async () => {
    const first = snapshot.products[0];
    const avg = first.reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / first.reviews.length;
    const [row] = await db.select().from(products).where(eq(products.slug, first.slug));
    expect(row!.ratingCount).toBe(first.reviews.length);
    expect(row!.ratingAvg).toBeCloseTo(Math.round(avg * 10) / 10, 5);
  });

  it("loads every review and keeps the stored rating in line with them", async () => {
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(reviews)) as [{ count: number }];
    const expected = snapshot.products.reduce((n: number, p: { reviews: unknown[] }) => n + p.reviews.length, 0);
    expect(count).toBe(expected);
    const first = snapshot.products[0];
    const [row] = await db.select().from(products).where(eq(products.slug, first.slug));
    const stored = await db.select().from(reviews).where(eq(reviews.productId, row!.id));
    expect(stored.length).toBe(row!.ratingCount);
  });

  it("never overwrites stock on a re-run", async () => {
    const slug = snapshot.products[0].slug;
    await db.update(products).set({ stock: 1 }).where(eq(products.slug, slug));
    runSeed();
    const [row] = await db.select().from(products).where(eq(products.slug, slug));
    expect(row!.stock).toBe(1);
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(products)) as [{ count: number }];
    expect(count).toBe(snapshot.products.length);
    const [{ reviewCount }] = (await db.select({ reviewCount: sql<number>`count(*)::int` }).from(reviews)) as [{ reviewCount: number }];
    expect(reviewCount).toBe(snapshot.products.reduce((n: number, p: { reviews: unknown[] }) => n + p.reviews.length, 0));
  });
});
