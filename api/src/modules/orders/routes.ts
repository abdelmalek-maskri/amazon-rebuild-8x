import express, { Router } from "express";
import { z } from "zod";
import { readCartId } from "../cart/cookie.js";
import * as service from "./service.js";

const OrderParams = z.object({ id: z.uuid() });

export const orderRoutes = Router();

orderRoutes.post("/checkout", async (req, res) => {
  res.status(201).json(await service.checkout(readCartId(req)));
});

// The order id is a random UUID, so the link itself is the access check, like a receipt link.
orderRoutes.get("/orders/:id", async (req, res) => {
  const { id } = OrderParams.parse(req.params);
  res.json(await service.getOrder(id));
});

// Mounted before express.json() in app.ts: the signature is over the exact raw bytes Stripe sent.
export const webhookRoutes = Router();

webhookRoutes.post("/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const event = service.verifyEvent(req.body as Buffer, req.get("stripe-signature"));
  // An error here becomes a 500, which makes Stripe retry later; that is what we want.
  await service.handleEvent(event);
  res.json({ received: true });
});
