import Stripe from "stripe";
import { env } from "./env.js";

// One client for the app. Stripe's own retries use idempotency keys, so retrying is safe.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 10_000, maxNetworkRetries: 2 });
