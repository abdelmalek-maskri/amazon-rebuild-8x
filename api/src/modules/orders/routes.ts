import express, { Router } from "express";
import { z } from "zod";
import { readCartId } from "../cart/cookie.js";
import { resolveCartId } from "../cart/service.js";
import { AppError } from "../../lib/errors.js";
import * as service from "./service.js";

const OrderParams = z.object({ id: z.uuid() });
// With a product, it's Buy Now; without one, the basket is checked out.
const BuyNowBody = z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(10).default(1) });

export const orderRoutes = Router();

orderRoutes.post("/checkout", async (req, res) => {
  const userId = res.locals.user?.id;
  if (req.body && "productId" in req.body) {
    const { productId, quantity } = BuyNowBody.parse(req.body);
    res.status(201).json(await service.buyNow(productId, quantity, userId));
    return;
  }
  res.status(201).json(await service.checkout(await resolveCartId(userId, readCartId(req)), userId));
});

// The order id is a random UUID, so the link itself is the access check, like a receipt link.
orderRoutes.get("/orders/:id", async (req, res) => {
  const { id } = OrderParams.parse(req.params);
  res.json(await service.getOrder(id, res.locals.user?.id));
});

orderRoutes.post("/orders/:id/cancel", async (req, res) => {
  const { id } = OrderParams.parse(req.params);
  res.json(await service.cancelOrder(id, res.locals.user?.id));
});

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

orderRoutes.get("/orders", async (req, res) => {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in to see your orders.");
  const { page, pageSize } = ListQuery.parse(req.query);
  res.json(await service.listOrders(user.id, page, pageSize));
});

// Mounted before express.json() in app.ts: the signature is over the exact raw bytes Stripe sent.
export const webhookRoutes = Router();

webhookRoutes.post("/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const event = service.verifyEvent(req.body as Buffer, req.get("stripe-signature"));
  // An error here becomes a 500, which makes Stripe retry later; that is what we want.
  await service.handleEvent(event);
  res.json({ received: true });
});
