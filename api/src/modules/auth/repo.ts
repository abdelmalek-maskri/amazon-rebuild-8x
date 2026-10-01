import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { sessions, users } from "../../db/schema.js";

export async function findUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row;
}

export async function createUser(email: string, name: string, passwordHash: string) {
  const [row] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email, name: users.name });
  return row;
}

export async function createSession(userId: string, tokenHash: string, expiresAt: Date) {
  await db.insert(sessions).values({ userId, tokenHash, expiresAt });
}

// Only live sessions count; an expired row is as good as no row.
export async function findSessionUser(tokenHash: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
  return row;
}

export async function deleteSession(tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteExpiredSessions(userId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, new Date())));
}
