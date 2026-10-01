import { Router } from "express";
import { z } from "zod";
import { readCartId, writeCartId } from "./cookie.js";
import * as service from "./service.js";

const Quantity = z.number().int().min(1).max(service.MAX_PER_LINE);
const AddBody = z.object({ productId: z.uuid(), quantity: Quantity.default(1) });
const UpdateBody = z.object({ quantity: Quantity });
const ItemParams = z.object({ itemId: z.uuid() });

export const cartRoutes = Router();

// Every response is the whole cart, so the basket count and totals in the UI never drift.
cartRoutes.get("/cart", async (req, res) => {
  res.json(await service.getCart(readCartId(req)));
});

cartRoutes.post("/cart/items", async (req, res) => {
  const { productId, quantity } = AddBody.parse(req.body);
  const cartId = await service.addItem(readCartId(req), productId, quantity);
  // Refreshed on every add, so an active cart keeps its 30 days.
  writeCartId(res, cartId);
  res.status(201).json(await service.getCart(cartId));
});

cartRoutes.patch("/cart/items/:itemId", async (req, res) => {
  const { itemId } = ItemParams.parse(req.params);
  const { quantity } = UpdateBody.parse(req.body);
  const cartId = readCartId(req);
  await service.updateItem(cartId, itemId, quantity);
  res.json(await service.getCart(cartId));
});

cartRoutes.delete("/cart/items/:itemId", async (req, res) => {
  const { itemId } = ItemParams.parse(req.params);
  const cartId = readCartId(req);
  await service.removeItem(cartId, itemId);
  res.json(await service.getCart(cartId));
});
