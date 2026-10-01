// One-off: pulls DummyJSON's catalogue into api/data/products.json so seeding never depends on a
// third party being up. Re-run only to refresh the snapshot: `npx tsx scripts/snapshot-products.ts`.
import { writeFileSync } from "node:fs";
import { z } from "zod";

const SOURCE = "https://dummyjson.com/products?limit=0";

// DummyJSON's 24 narrow categories folded into Amazon style departments. Unlisted ones
// (vehicle, motorcycle) are dropped: nobody puts a car in a basket.
const DEPARTMENTS: Record<string, { slug: string; name: string; from: string[] }> = {
  electronics: { slug: "electronics", name: "Electronics", from: ["smartphones", "laptops", "tablets", "mobile-accessories"] },
  home: { slug: "home-kitchen", name: "Home & Kitchen", from: ["kitchen-accessories", "furniture", "home-decoration"] },
  fashion: {
    slug: "fashion",
    name: "Fashion",
    from: ["mens-shirts", "mens-shoes", "tops", "womens-dresses", "womens-shoes", "womens-bags", "sunglasses"],
  },
  watches: { slug: "watches-jewelry", name: "Watches & Jewelry", from: ["mens-watches", "womens-watches", "womens-jewellery"] },
  beauty: { slug: "beauty", name: "Beauty", from: ["beauty", "fragrances", "skin-care"] },
  sports: { slug: "sports-outdoors", name: "Sports & Outdoors", from: ["sports-accessories"] },
  grocery: { slug: "grocery", name: "Grocery", from: ["groceries"] },
};

const Source = z.object({
  products: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string(),
      category: z.string(),
      brand: z.string().optional(),
      price: z.number().positive(),
      stock: z.number().int().nonnegative(),
      thumbnail: z.url(),
      images: z.array(z.url()),
      reviews: z.array(
        z.object({ rating: z.number().int().min(1).max(5), comment: z.string(), date: z.string(), reviewerName: z.string() }),
      ),
    }),
  ),
});

const departmentOf = new Map(Object.values(DEPARTMENTS).flatMap((d) => d.from.map((c) => [c, d.slug] as const)));

function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`DummyJSON returned ${res.status}`);
const { products } = Source.parse(await res.json());

const seen = new Map<string, number>();
const kept = products
  .filter((p) => departmentOf.has(p.category))
  .map((p) => {
    // DummyJSON has one duplicate title; suffix keeps slugs unique and stable across runs.
    const base = slugify(p.title);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      slug: n === 1 ? base : `${base}-${n}`,
      title: p.title,
      description: p.description,
      brand: p.brand ?? null,
      category: departmentOf.get(p.category)!,
      priceCents: Math.round(p.price * 100),
      stock: p.stock,
      thumbnail: p.thumbnail,
      images: p.images,
      // Reviewer emails are dropped: we never need them.
      reviews: p.reviews.map(({ rating, comment, date, reviewerName }) => ({ rating, comment, date, reviewerName })),
    };
  });

const snapshot = {
  source: SOURCE,
  fetchedAt: new Date().toISOString(),
  categories: Object.values(DEPARTMENTS).map(({ slug, name }) => ({ slug, name })),
  products: kept,
};

writeFileSync(new URL("../data/products.json", import.meta.url), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`wrote ${kept.length} of ${products.length} products in ${snapshot.categories.length} categories`);
