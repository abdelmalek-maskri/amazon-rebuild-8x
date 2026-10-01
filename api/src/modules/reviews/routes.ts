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

// Trimmed first, so a body of only spaces is rejected rather than stored.
const NewReview = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10, { error: "Write at least 10 characters." }).max(2000),
});

export const reviewRoutes = Router();

reviewRoutes.get("/products/:slug/reviews/eligibility", async (req, res) => {
  const { slug } = Params.parse(req.params);
  res.json(await service.getEligibility(slug, res.locals.user));
});

reviewRoutes.post("/products/:slug/reviews", async (req, res) => {
  const { slug } = Params.parse(req.params);
  const { rating, body } = NewReview.parse(req.body);
  res.status(201).json(await service.createReview(slug, res.locals.user, rating, body));
});

reviewRoutes.get("/products/:slug/reviews", async (req, res) => {
  const { slug } = Params.parse(req.params);
  const { stars, sort, page, pageSize } = Query.parse(req.query);
  res.json(await service.getReviews(slug, stars, sort, page, pageSize));
});
