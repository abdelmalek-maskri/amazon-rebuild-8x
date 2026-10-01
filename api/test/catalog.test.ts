import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/index.js";
import { createCategory, createProduct, resetDb } from "./helpers.js";

const app = createApp();

type Summary = { slug: string; priceCents: number; availability: { status: string; left?: number } };
const slugs = (body: { items: Summary[] }) => body.items.map((p) => p.slug);

// A small catalogue with known answers for every filter.
beforeAll(async () => {
  await resetDb();
  const phones = await createCategory({ slug: "electronics", name: "Electronics" });
  const kitchen = await createCategory({ slug: "home-kitchen", name: "Home & Kitchen" });
  await createCategory({ slug: "empty", name: "Empty" });
  const p = (slug: string, o: Parameters<typeof createProduct>[0]) => createProduct({ slug, title: slug, ...o });
  await p("iphone-13-pro", { title: "iPhone 13 Pro", brand: "Apple", categoryId: phones.id, priceCents: 109999, ratingAvg: 4.5, ratingCount: 3, stock: 50 });
  await p("galaxy-s10", { title: "Samsung Galaxy S10", brand: "Samsung", categoryId: phones.id, priceCents: 69999, ratingAvg: 3.7, ratingCount: 3, stock: 3 });
  await p("apple-airpods", { title: "Apple AirPods", brand: "Apple", categoryId: phones.id, priceCents: 12999, ratingAvg: 2.3, ratingCount: 3, stock: 0 });
  await p("chef-knife", { title: "Chef Knife", brand: null, categoryId: kitchen.id, priceCents: 2999, ratingAvg: 4.0, ratingCount: 3, stock: 20, description: "100% steel" });
  await p("frying-pan", { title: "Frying Pan", brand: null, categoryId: kitchen.id, priceCents: 1999, ratingAvg: 3.0, ratingCount: 3, stock: 20 });
});
afterAll(() => pool.end());

describe("GET /products", () => {
  it("lists everything in featured order with paging info", async () => {
    const res = await request(app).get("/products");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, page: 1, pageSize: 24, sort: "featured" });
    expect(slugs(res.body)).toEqual(["iphone-13-pro", "chef-knife", "galaxy-s10", "frying-pan", "apple-airpods"]);
  });

  it("matches every search word across title, brand and category, ignoring case", async () => {
    expect(slugs((await request(app).get("/products?q=APPLE")).body).sort()).toEqual(["apple-airpods", "iphone-13-pro"]);
    expect(slugs((await request(app).get("/products?q=apple 13")).body)).toEqual(["iphone-13-pro"]);
    expect(slugs((await request(app).get("/products?q=kitchen")).body).sort()).toEqual(["chef-knife", "frying-pan"]);
  });

  it("treats % and _ as plain characters, not wildcards", async () => {
    expect(slugs((await request(app).get("/products?q=%25")).body)).toEqual(["chef-knife"]);
    expect((await request(app).get("/products?q=_")).body.total).toBe(0);
  });

  it("ranks products with the words in their title first when searching", async () => {
    // AirPods is rated lower, but "Apple" is in its title; the iPhone only matches on brand.
    const res = await request(app).get("/products?q=apple");
    expect(res.body.sort).toBe("relevance");
    expect(slugs(res.body)).toEqual(["apple-airpods", "iphone-13-pro"]);
  });

  it("combines category, brand, price, rating and stock filters", async () => {
    const res = await request(app).get("/products?category=electronics&brand=Apple&brand=Samsung&minPrice=50000&minRating=3&inStock=true");
    expect(slugs(res.body).sort()).toEqual(["galaxy-s10", "iphone-13-pro"]);
    const narrower = await request(app).get("/products?category=electronics&maxPrice=70000&inStock=true");
    expect(slugs(narrower.body)).toEqual(["galaxy-s10"]);
  });

  it("sorts by price both ways", async () => {
    const asc = slugs((await request(app).get("/products?sort=price_asc")).body);
    expect(asc[0]).toBe("frying-pan");
    expect(asc.at(-1)).toBe("iphone-13-pro");
    expect(slugs((await request(app).get("/products?sort=price_desc")).body)[0]).toBe("iphone-13-pro");
  });

  it("pages without repeating or skipping products", async () => {
    const one = await request(app).get("/products?pageSize=2&page=1");
    const two = await request(app).get("/products?pageSize=2&page=2");
    const three = await request(app).get("/products?pageSize=2&page=3");
    expect(one.body.total).toBe(5);
    expect(new Set([...slugs(one.body), ...slugs(two.body), ...slugs(three.body)]).size).toBe(5);
  });

  it("reports stock as a status, never the raw count", async () => {
    const items: Summary[] = (await request(app).get("/products")).body.items;
    const by = Object.fromEntries(items.map((p) => [p.slug, p]));
    expect(by["iphone-13-pro"]!.availability).toEqual({ status: "in_stock" });
    expect(by["galaxy-s10"]!.availability).toEqual({ status: "low_stock", left: 3 });
    expect(by["apple-airpods"]!.availability).toEqual({ status: "out_of_stock" });
    expect(items[0]).not.toHaveProperty("stock");
  });

  it("counts each filter's options as if that filter were not applied", async () => {
    const { facets } = (await request(app).get("/products?brand=Apple&category=electronics")).body;
    // Brand counts ignore the brand filter, so Samsung is still offered.
    expect(facets.brands).toEqual([
      { name: "Apple", count: 2 },
      { name: "Samsung", count: 1 },
    ]);
    // Category counts ignore the category filter but respect the brand one.
    expect(facets.categories).toEqual([{ slug: "electronics", name: "Electronics", count: 2 }]);
    expect(facets.ratings).toEqual([
      { min: 4, count: 1 },
      { min: 3, count: 1 },
      { min: 2, count: 2 },
      { min: 1, count: 2 },
    ]);
  });

  it.each([
    ["minPrice=-1", "minPrice"],
    ["minPrice=500&maxPrice=100", "minPrice"],
    ["sort=cheapest", "sort"],
    ["pageSize=1000", "pageSize"],
    ["minRating=5", "minRating"],
    ["category=Electronics!", "category"],
    [`q=${"a".repeat(101)}`, "q"],
  ])("rejects %s with 400 and names the field", async (query, field) => {
    const res = await request(app).get(`/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const res = await request(app).get("/products?q=toaster");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });
});

describe("GET /products/:slug", () => {
  it("returns the product with its category and images", async () => {
    const res = await request(app).get("/products/galaxy-s10");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: "galaxy-s10",
      title: "Samsung Galaxy S10",
      priceCents: 69999,
      category: { slug: "electronics", name: "Electronics" },
      availability: { status: "low_stock", left: 3 },
    });
    expect(res.body).not.toHaveProperty("stock");
  });

  it("returns 404 for an unknown product and 400 for a malformed slug", async () => {
    const missing = await request(app).get("/products/no-such-thing");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("PRODUCT_NOT_FOUND");
    expect((await request(app).get("/products/DROP%20TABLE")).status).toBe(400);
  });
});

describe("GET /categories", () => {
  it("lists every category with its product count, empty ones included", async () => {
    const res = await request(app).get("/categories");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { slug: "electronics", name: "Electronics", productCount: 3 },
      { slug: "empty", name: "Empty", productCount: 0 },
      { slug: "home-kitchen", name: "Home & Kitchen", productCount: 2 },
    ]);
  });
});

describe("GET /suggestions", () => {
  it("ranks titles starting with the query first, then word starts, then anything else", async () => {
    await createProduct({ slug: "phone-stand", title: "Phone Stand", ratingAvg: 1 });
    await createProduct({ slug: "smart-phone-case", title: "Smart Phone Case", ratingAvg: 1 });
    await createProduct({ slug: "earphones", title: "Wired Earphones", ratingAvg: 5 });
    await createProduct({ slug: "cable", title: "USB Cable", description: "Charges any phone", ratingAvg: 5 });
    const res = await request(app).get("/suggestions?q=phone");
    expect(res.status).toBe(200);
    // Rating only breaks ties inside a rank: the 1 star "Phone Stand" still beats 5 star "Earphones".
    expect(res.body.products.map((p: { slug: string }) => p.slug)).toEqual(["phone-stand", "smart-phone-case", "earphones", "iphone-13-pro", "cable"]);
    expect(res.body.products[0]).toEqual({ slug: "phone-stand", title: "Phone Stand", brand: null, imageUrl: expect.any(String) });
  });

  it("matches brands and suggests departments by name", async () => {
    const res = await request(app).get("/suggestions?q=kitch");
    expect(res.body.categories).toEqual([{ slug: "home-kitchen", name: "Home & Kitchen" }]);
    const apple = await request(app).get("/suggestions?q=apple");
    expect(apple.body.products.map((p: { slug: string }) => p.slug)).toContain("iphone-13-pro");
  });

  it("caps the list at 6 products and lets the browser cache it briefly", async () => {
    const res = await request(app).get("/suggestions?q=te");
    expect(res.body.products.length).toBeLessThanOrEqual(6);
    expect(res.headers["cache-control"]).toBe("private, max-age=60");
  });

  it("treats wildcards as text and rejects queries under 2 characters", async () => {
    expect((await request(app).get("/suggestions?q=%25%25")).body.products).toEqual([]);
    const short = await request(app).get("/suggestions?q=a");
    expect(short.status).toBe(400);
    expect(short.body.fields[0].path).toBe("q");
  });
});
