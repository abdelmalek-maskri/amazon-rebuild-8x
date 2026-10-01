import type { Request, Response } from "express";
import { env } from "../../lib/env.js";

const NAME = "session";
export const SESSION_DAYS = 30;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// Same rules as the cart cookie: httpOnly so scripts can't read it, Lax so cross-site POSTs don't
// carry it. Anything that doesn't look like one of our tokens is ignored.
export function readSessionToken(req: Request): string | undefined {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === NAME) {
      const value = rest.join("=");
      return TOKEN.test(value) ? value : undefined;
    }
  }
  return undefined;
}

const options = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/" };

export function writeSessionToken(res: Response, token: string) {
  res.cookie(NAME, token, { ...options, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function clearSessionToken(res: Response) {
  res.clearCookie(NAME, options);
}
