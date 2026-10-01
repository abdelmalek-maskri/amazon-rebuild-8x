import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categories, products } from "../../db/schema.js";

export type ProductSort = "relevance" | "featured" | "price_asc" | "price_desc" | "rating" | "newest";

export type ProductFilters = {
  q?: string;
  category?: string;
  brands: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  minRating?: number;
  inStock: boolean;
};

type FilterKey = "category" | "brands" | "minRating";

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, "\\$&");
}

function searchTerms(q?: string) {
  return (q ?? "").split(/\s+/).filter(Boolean);
}

// One condition per active filter. Facet queries drop their own filter, so ticking a brand
// still shows the counts for the other brands instead of collapsing to one option.
function conditions(f: ProductFilters, except?: FilterKey): SQL[] {
  const where: SQL[] = [];
  for (const term of searchTerms(f.q)) {
    const like = `%${escapeLike(term)}%`;
    where.push(or(ilike(products.title, like), ilike(products.brand, like), ilike(products.description, like), ilike(categories.name, like))!);
  }
  if (f.category && except !== "category") where.push(eq(categories.slug, f.category));
  if (f.brands.length && except !== "brands") where.push(inArray(products.brand, f.brands));
  if (f.minPriceCents !== undefined) where.push(gte(products.priceCents, f.minPriceCents));
  if (f.maxPriceCents !== undefined) where.push(lte(products.priceCents, f.maxPriceCents));
  if (f.minRating !== undefined && except !== "minRating") where.push(gte(products.ratingAvg, f.minRating));
  if (f.inStock) where.push(sql`${products.stock} > 0`);
  return where;
}

function orderBy(sort: ProductSort, q?: string): SQL[] {
  const featured = [desc(products.ratingAvg), desc(products.ratingCount), asc(products.title)];
  // products.id last everywhere: without a unique tie-breaker, rows can jump between pages.
  switch (sort) {
    case "price_asc":
      return [asc(products.priceCents), asc(products.id)];
    case "price_desc":
      return [desc(products.priceCents), asc(products.id)];
    case "rating":
      return [...featured, asc(products.id)];
    case "newest":
      return [desc(products.createdAt), asc(products.id)];
    case "relevance": {
      const terms = searchTerms(q);
      if (!terms.length) return [...featured, asc(products.id)];
      // Products whose title holds every word come first; then the featured order.
      const inTitle = and(...terms.map((t) => ilike(products.title, `%${escapeLike(t)}%`)))!;
      return [sql`(case when ${inTitle} then 0 else 1 end)`, ...featured, asc(products.id)];
    }
    case "featured":
      return [...featured, asc(products.id)];
  }
}

const summaryColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  brand: products.brand,
  priceCents: products.priceCents,
  imageUrl: products.imageUrl,
  ratingAvg: products.ratingAvg,
  ratingCount: products.ratingCount,
  stock: products.stock,
};

export async function listProducts(f: ProductFilters, sort: ProductSort, limit: number, offset: number) {
  const where = and(...conditions(f));
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(summaryColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(...orderBy(sort, f.q))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products).innerJoin(categories, eq(products.categoryId, categories.id)).where(where),
  ]);
  return { rows, total: totalRow?.total ?? 0 };
}

export async function productFacets(f: ProductFilters) {
  const [categoryRows, brandRows, [ratingRow]] = await Promise.all([
    db
      .select({ slug: categories.slug, name: categories.name, count: count() })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions(f, "category")))
      .groupBy(categories.slug, categories.name)
      .orderBy(asc(categories.name)),
    db
      .select({ name: products.brand, count: count() })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(isNotNull(products.brand), ...conditions(f, "brands")))
      .groupBy(products.brand)
      .orderBy(desc(count()), asc(products.brand))
      .limit(20),
    db
      .select({
        4: sql<number>`count(*) filter (where ${products.ratingAvg} >= 4)::int`,
        3: sql<number>`count(*) filter (where ${products.ratingAvg} >= 3)::int`,
        2: sql<number>`count(*) filter (where ${products.ratingAvg} >= 2)::int`,
        1: sql<number>`count(*) filter (where ${products.ratingAvg} >= 1)::int`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions(f, "minRating"))),
  ]);
  return {
    categories: categoryRows,
    brands: brandRows.map((b) => ({ name: b.name!, count: b.count })),
    ratings: ([4, 3, 2, 1] as const).map((min) => ({ min, count: ratingRow?.[min] ?? 0 })),
  };
}

export async function findProductBySlug(slug: string) {
  const [row] = await db
    .select({
      ...summaryColumns,
      description: products.description,
      images: products.images,
      category: { slug: categories.slug, name: categories.name },
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.slug, slug));
  return row;
}

export async function listCategories() {
  return db
    .select({ slug: categories.slug, name: categories.name, productCount: count(products.id) })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.slug, categories.name)
    .orderBy(asc(categories.name));
}
