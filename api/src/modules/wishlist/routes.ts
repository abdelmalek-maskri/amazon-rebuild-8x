import { Router } from "express";
import { z } from "zod";
import * as service from "./service.js";

const ProductParams = z.object({ productId: z.uuid() });
const AddBody = z.object({ productId: z.uuid() });

export const wishlistRoutes = Router();

wishlistRoutes.get("/wishlist", async (_req, res) => {
  res.json(await service.getWishlist(res.locals.user?.id));
});

// Lets the product page show "Saved to your list"; false for guests rather than an error.
wishlistRoutes.get("/wishlist/status/:productId", async (req, res) => {
  const { productId } = ProductParams.parse(req.params);
  res.json(await service.status(res.locals.user?.id, productId));
});

wishlistRoutes.post("/wishlist/items", async (req, res) => {
  const { productId } = AddBody.parse(req.body);
  res.status(201).json(await service.addItem(res.locals.user?.id, productId));
});

wishlistRoutes.delete("/wishlist/items/:productId", async (req, res) => {
  const { productId } = ProductParams.parse(req.params);
  res.json(await service.removeItem(res.locals.user?.id, productId));
});

wishlistRoutes.post("/wishlist/items/:productId/move-to-basket", async (req, res) => {
  const { productId } = ProductParams.parse(req.params);
  res.json(await service.moveToBasket(res.locals.user?.id, productId));
});
