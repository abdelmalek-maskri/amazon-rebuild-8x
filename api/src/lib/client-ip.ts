import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import { env } from "./env.js";

const secret = env.PROXY_SECRET ? Buffer.from(env.PROXY_SECRET) : null;

function fromOurProxy(req: Request) {
  const given = req.get("x-store-proxy-secret");
  if (!secret || !given) return false;
  const buf = Buffer.from(given);
  // Constant time, so the secret can't be guessed one character at a time.
  return buf.length === secret.length && timingSafeEqual(buf, secret);
}

// Requests from the website arrive from Vercel's servers, so req.ip is Vercel, not the shopper.
// The web proxy passes the shopper's address along with a shared secret; anyone else's header is
// ignored, so calling the API directly can't fake an address to dodge a rate limit.
export function clientIp(req: Request): string {
  const claimed = req.get("x-store-client-ip")?.trim();
  if (claimed && isIP(claimed) && fromOurProxy(req)) return claimed;
  return req.ip ?? "unknown";
}
