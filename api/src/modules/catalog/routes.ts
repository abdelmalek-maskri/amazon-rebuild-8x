import { Router } from "express";
import { z } from "zod";
import * as service from "./service.js";

const MAX_PRICE_CENTS = 10_000_000;

// Query strings arrive as strings, or arrays when a key repeats (?brand=a&brand=b).
const oneOrMany = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.string().trim().min(1).max(60)).max(20));

const cents = z.coerce.number().int().min(0).max(MAX_PRICE_CENTS);

const ListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
    brand: oneOrMany.optional(),
    minPrice: cents.optional(),
    maxPrice: cents.optional(),
    minRating: z.coerce.number().int().min(1).max(4).optional(),
    inStock: z.enum(["true", "false"]).optional(),
    sort: z.enum(["relevance", "featured", "price_asc", "price_desc", "rating", "newest"]).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: "minPrice must not be above maxPrice",
    path: ["minPrice"],
  });

const Slug = z.string().regex(/^[a-z0-9-]{1,120}$/);

const SuggestQuery = z.object({ q: z.string().trim().min(2).max(100) });

export const catalogRoutes = Router();

catalogRoutes.get("/categories", async (_req, res) => {
  res.json(await service.getCategories());
});

// Prices in the query are integer cents, like everywhere else in the API.
catalogRoutes.get("/products", async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filters = {
    q: q.q || undefined,
    category: q.category,
    brands: q.brand ?? [],
    minPriceCents: q.minPrice,
    maxPriceCents: q.maxPrice,
    minRating: q.minRating,
    inStock: q.inStock === "true",
  };
  res.json(await service.searchProducts(filters, q.sort, q.page, q.pageSize));
});

catalogRoutes.get("/products/:slug", async (req, res) => {
  res.json(await service.getProduct(Slug.parse(req.params.slug)));
});

// Called on every pause in typing, so it stays small: 6 products, 3 departments, no facets.
catalogRoutes.get("/suggestions", async (req, res) => {
  const { q } = SuggestQuery.parse(req.query);
  // Short private cache: the same prefix typed twice in a minute is answered by the browser.
  res.set("Cache-Control", "private, max-age=60");
  res.json(await service.getSuggestions(q));
});
