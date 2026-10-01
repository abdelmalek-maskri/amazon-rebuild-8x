import { Router } from "express";
import { z } from "zod";
import * as service from "./service.js";

const Params = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/) });
const Query = z.object({
  stars: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(["recent", "highest", "lowest"]).default("recent"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

export const reviewRoutes = Router();

reviewRoutes.get("/products/:slug/reviews", async (req, res) => {
  const { slug } = Params.parse(req.params);
  const { stars, sort, page, pageSize } = Query.parse(req.query);
  res.json(await service.getReviews(slug, stars, sort, page, pageSize));
});
