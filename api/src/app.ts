import express from "express";
import helmet from "helmet";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { httpLogger } from "./lib/logger.js";
import { cartRoutes } from "./modules/cart/routes.js";
import { catalogRoutes } from "./modules/catalog/routes.js";
import { orderRoutes, webhookRoutes } from "./modules/orders/routes.js";
import { reviewRoutes } from "./modules/reviews/routes.js";

export function createApp() {
  const app = express();

  // Railway terminates TLS at one proxy hop, needed for the real client IP and secure cookies.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(httpLogger);
  // Before express.json(): Stripe signs the raw body, and a parsed body can no longer be verified.
  app.use(webhookRoutes);
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: "ok", db: "ok" });
    } catch (err) {
      // 503 so Railway's health check sees the outage; the cause is logged, not returned.
      res.log.error({ err }, "health check database query failed");
      res.status(503).json({ status: "error", db: "down" });
    }
  });

  app.use(catalogRoutes);
  app.use(cartRoutes);
  app.use(reviewRoutes);
  app.use(orderRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
