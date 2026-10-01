import type { Request, Response } from "express";
import { env } from "../../lib/env.js";

const NAME = "cart_id";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The cart id is the only cookie we read, and anything that isn't a UUID is ignored, so a tiny
// parser is safer than another dependency. The id is random (122 bits), so it works as a bearer token.
export function readCartId(req: Request): string | undefined {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === NAME) {
      const value = rest.join("=");
      return UUID.test(value) ? value.toLowerCase() : undefined;
    }
  }
  return undefined;
}

export function writeCartId(res: Response, cartId: string) {
  res.cookie(NAME, cartId, {
    // Never readable from page scripts, so an XSS bug can't lift someone's cart.
    httpOnly: true,
    // Lax keeps the cookie off cross-site POSTs, which with JSON-only endpoints and no CORS closes CSRF.
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}
