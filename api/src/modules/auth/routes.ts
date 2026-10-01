import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { clearCartId, readCartId } from "../cart/cookie.js";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./cookie.js";
import * as service from "./service.js";

declare global {
  namespace Express {
    interface Locals {
      user: service.SessionUser | null;
    }
  }
}

// Trim before checking the format: pasted emails often carry stray spaces.
const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254));
// 128 caps the work argon2 can be made to do per request.
const Password = z.string().min(8, { error: "Use at least 8 characters." }).max(128);
const SignUpBody = z.object({ email: Email, name: z.string().trim().min(1).max(50), password: Password });
const SignInBody = z.object({ email: Email, password: z.string().min(1).max(128) });

// Every request learns who is signed in, once, so routes never parse the session themselves.
export const loadUser: RequestHandler = async (req, res, next) => {
  res.locals.user = await service.userForToken(readSessionToken(req));
  next();
};

const tooMany = { error: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait a few minutes and try again." };

// Built per app, so every test app starts with a clean count. In memory is enough for one Railway instance.
export function authRoutes() {
  const router = Router();
  const signInLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: tooMany });
  const signUpLimit = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: tooMany });

  router.post("/auth/signup", signUpLimit, async (req, res) => {
    const { email, name, password } = SignUpBody.parse(req.body);
    const { user, token } = await service.signUp(email, name, password, readCartId(req));
    writeSessionToken(res, token);
    clearCartId(res);
    res.status(201).json({ user });
  });

  router.post("/auth/signin", signInLimit, async (req, res) => {
    const { email, password } = SignInBody.parse(req.body);
    const { user, token } = await service.signIn(email, password, readCartId(req), readSessionToken(req));
    writeSessionToken(res, token);
    clearCartId(res);
    res.json({ user });
  });

  // Signing out keeps the account's basket saved; this browser goes back to an empty guest basket.
  router.post("/auth/signout", async (req, res) => {
    await service.signOut(readSessionToken(req));
    clearSessionToken(res);
    clearCartId(res);
    res.json({ user: null });
  });

  router.get("/auth/me", (_req, res) => {
    res.json({ user: res.locals.user });
  });

  return router;
}
