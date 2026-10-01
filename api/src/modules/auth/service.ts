import { createHash, randomBytes } from "node:crypto";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as cart from "../cart/service.js";
import { SESSION_DAYS } from "./cookie.js";
import * as repo from "./repo.js";

export type SessionUser = { id: string; email: string; name: string };

// OWASP's argon2id baseline: 19 MiB memory, 2 iterations, 1 lane.
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// Hashed once, used to spend the same time on unknown emails as on wrong passwords, so response
// time doesn't reveal which emails have accounts.
let decoy: Promise<string> | undefined;
const decoyHash = () => (decoy ??= hash(randomBytes(16).toString("hex"), ARGON));

const badCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "That email and password don't match an account.");

async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await repo.createSession(userId, tokenHash(token), new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000));
  return token;
}

export async function signUp(email: string, name: string, password: string, guestCartId: string | undefined) {
  const user = await repo.createUser(email, name, await hash(password, ARGON));
  if (!user) throw new AppError(409, "EMAIL_TAKEN", "There's already an account with this email. Sign in instead.");
  await cart.mergeGuestCart(guestCartId, user.id);
  logger.info({ userId: user.id }, "user_signed_up");
  return { user, token: await startSession(user.id) };
}

export async function signIn(email: string, password: string, guestCartId: string | undefined, oldToken: string | undefined) {
  const found = await repo.findUserByEmail(email);
  const ok = await verify(found?.passwordHash ?? (await decoyHash()), password);
  if (!found || !ok) {
    logger.info("signin_failed");
    throw badCredentials();
  }
  // Rotate: whatever session this browser had before is ended, never reused.
  if (oldToken) await repo.deleteSession(tokenHash(oldToken));
  await repo.deleteExpiredSessions(found.id);
  await cart.mergeGuestCart(guestCartId, found.id);
  logger.info({ userId: found.id }, "user_signed_in");
  return { user: { id: found.id, email: found.email, name: found.name }, token: await startSession(found.id) };
}

export async function signOut(token: string | undefined) {
  if (token) await repo.deleteSession(tokenHash(token));
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return (await repo.findSessionUser(tokenHash(token))) ?? null;
}
