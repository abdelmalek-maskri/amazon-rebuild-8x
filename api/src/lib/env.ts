import { existsSync } from "node:fs";
import { z } from "zod";

if (existsSync(".env")) process.loadEnvFile(".env");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Test keys only: this store must never be able to take real money, even if misconfigured.
  STRIPE_SECRET_KEY: z.string().regex(/^sk_test_\w+$/, "must be a Stripe test key (sk_test_...)"),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_\w+$/, "must be a Stripe webhook signing secret (whsec_...)"),
  // Where Stripe sends shoppers back to after paying or cancelling.
  WEB_URL: z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/$/, "")),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
