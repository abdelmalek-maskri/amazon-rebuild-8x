import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/index.js";
import { carts, sessions, users } from "../src/db/schema.js";
import { closeServers, createProduct, resetDb, serve } from "./helpers.js";

beforeEach(resetDb);
afterAll(async () => {
  await closeServers();
  await pool.end();
});

const ada = { email: "Ada@Example.com", name: "Ada", password: "correct horse battery" };

// A fresh app per test gives each one its own rate limit counters.
function shopper() {
  return request.agent(serve());
}

const cookieNames = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[]) ?? []).map((c) => c.split(";")[0]!);

describe("sign up", () => {
  it("creates the account, signs it in and never stores the password", async () => {
    const agent = shopper();
    const res = await agent.post("/auth/signup").send(ada);
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(String), email: "ada@example.com", name: "Ada" });

    const session = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("session="))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect((await agent.get("/auth/me")).body.user.email).toBe("ada@example.com");

    const [row] = await db.select().from(users);
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row!.passwordHash).not.toContain(ada.password);
    // Only a hash of the cookie token is stored.
    const token = session.split(";")[0]!.split("=")[1]!;
    const [stored] = await db.select().from(sessions);
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a second account with the same email, whatever its case", async () => {
    await shopper().post("/auth/signup").send(ada).expect(201);
    const res = await shopper().post("/auth/signup").send({ ...ada, email: "  ADA@example.COM " });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EMAIL_TAKEN");
  });

  it.each([
    [{ ...ada, password: "short" }, "password"],
    [{ ...ada, password: "x".repeat(129) }, "password"],
    [{ ...ada, email: "not-an-email" }, "email"],
    [{ ...ada, name: "   " }, "name"],
  ])("rejects %o with 400", async (body, field) => {
    const res = await shopper().post("/auth/signup").send(body);
    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });
});

describe("sign in and out", () => {
  beforeEach(async () => {
    await shopper().post("/auth/signup").send(ada).expect(201);
  });

  it("signs in with the right password and gives a different session each time", async () => {
    const first = await shopper().post("/auth/signin").send({ email: "ada@example.com", password: ada.password });
    const second = await shopper().post("/auth/signin").send({ email: "ADA@example.com", password: ada.password });
    expect(first.status).toBe(200);
    expect(cookieNames(first).find((c) => c.startsWith("session="))).not.toBe(cookieNames(second).find((c) => c.startsWith("session=")));
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await shopper().post("/auth/signin").send({ email: "ada@example.com", password: "wrong password" });
    const unknown = await shopper().post("/auth/signin").send({ email: "nobody@example.com", password: "wrong password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("ends the old session when signing in again on the same browser", async () => {
    const agent = shopper();
    await agent.post("/auth/signin").send({ email: "ada@example.com", password: ada.password }).expect(200);
    const before = await db.select().from(sessions);
    await agent.post("/auth/signin").send({ email: "ada@example.com", password: ada.password }).expect(200);
    const after = await db.select().from(sessions);
    // Sign up's session plus exactly one live session for this browser.
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(2);
  });

  it("signs out for good: the old cookie no longer works", async () => {
    const agent = shopper();
    const res = await agent.post("/auth/signin").send({ email: "ada@example.com", password: ada.password });
    const oldCookie = cookieNames(res).find((c) => c.startsWith("session="))!;
    await agent.post("/auth/signout").expect(200);
    expect((await agent.get("/auth/me")).body.user).toBeNull();
    // Replaying the old cookie by hand gets nothing.
    expect((await request(serve()).get("/auth/me").set("Cookie", oldCookie)).body.user).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    const agent = shopper();
    await agent.post("/auth/signin").send({ email: "ada@example.com", password: ada.password }).expect(200);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await agent.get("/auth/me")).body.user).toBeNull();
  });

  it("slows down guessing: the 11th sign in attempt in 15 minutes is refused", async () => {
    const agent = shopper();
    for (let i = 0; i < 10; i++) await agent.post("/auth/signin").send({ email: "ada@example.com", password: "guess" }).expect(401);
    const res = await agent.post("/auth/signin").send({ email: "ada@example.com", password: ada.password });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("baskets and accounts", () => {
  it("turns the guest basket into the account's basket on sign up", async () => {
    const product = await createProduct({ stock: 10 });
    const agent = shopper();
    await agent.post("/cart/items").send({ productId: product.id, quantity: 2 }).expect(201);
    await agent.post("/auth/signup").send(ada).expect(201);
    expect((await agent.get("/cart")).body.itemCount).toBe(2);
    const [cart] = await db.select().from(carts);
    expect(cart!.userId).not.toBeNull();
  });

  it("merges a guest basket into the saved one on sign in, capped by stock", async () => {
    const shared = await createProduct({ stock: 4 });
    const other = await createProduct({ stock: 10 });
    const laptop = shopper();
    await laptop.post("/auth/signup").send(ada).expect(201);
    await laptop.post("/cart/items").send({ productId: shared.id, quantity: 3 }).expect(201);
    await laptop.post("/auth/signout").expect(200);

    const phone = shopper();
    await phone.post("/cart/items").send({ productId: shared.id, quantity: 2 }).expect(201);
    await phone.post("/cart/items").send({ productId: other.id, quantity: 1 }).expect(201);
    await phone.post("/auth/signin").send({ email: ada.email, password: ada.password }).expect(200);

    const cart = (await phone.get("/cart")).body;
    const qty = Object.fromEntries(cart.items.map((i: { product: { id: string }; quantity: number }) => [i.product.id, i.quantity]));
    // 3 + 2 = 5, but only 4 exist.
    expect(qty).toEqual({ [shared.id]: 4, [other.id]: 1 });
    // The guest basket is gone; only the account's remains.
    expect(await db.select().from(carts)).toHaveLength(1);
  });

  it("leaves an empty guest basket after sign out, while the account's basket is kept", async () => {
    const product = await createProduct({ stock: 10 });
    const agent = shopper();
    await agent.post("/auth/signup").send(ada).expect(201);
    await agent.post("/cart/items").send({ productId: product.id }).expect(201);
    await agent.post("/auth/signout").expect(200);
    expect((await agent.get("/cart")).body.itemCount).toBe(0);
    await agent.post("/auth/signin").send({ email: ada.email, password: ada.password }).expect(200);
    expect((await agent.get("/cart")).body.itemCount).toBe(1);
  });

  it("never lets a guest cookie open a basket that belongs to an account", async () => {
    const product = await createProduct({ stock: 10 });
    const agent = shopper();
    await agent.post("/auth/signup").send(ada).expect(201);
    await agent.post("/cart/items").send({ productId: product.id }).expect(201);
    const [owned] = await db.select().from(carts).where(eq(carts.userId, (await db.select().from(users))[0]!.id));
    const res = await request(serve()).get("/cart").set("Cookie", `cart_id=${owned!.id}`);
    expect(res.body.itemCount).toBe(0);
  });
});

describe("rate limits behind the website's proxy", () => {
  const SECRET = "test-proxy-secret-test-proxy-secret-0123";
  const attempt = (agent: ReturnType<typeof request.agent>, headers: Record<string, string>) =>
    agent.post("/auth/signin").set(headers).send({ email: "nobody@example.com", password: "guess" });

  it("counts each shopper separately when the request comes through our site", async () => {
    // One app (one set of counters), like production: every request arrives from the same proxy.
    const agent = request.agent(serve());
    const viaSite = (ip: string) => ({ "x-store-proxy-secret": SECRET, "x-store-client-ip": ip });
    for (let i = 0; i < 10; i++) await attempt(agent, viaSite("203.0.113.7")).expect(401);
    expect((await attempt(agent, viaSite("203.0.113.7"))).status).toBe(429);
    // A different shopper behind the same proxy is not locked out by the first one.
    expect((await attempt(agent, viaSite("198.51.100.20"))).status).toBe(401);
  });

  it("ignores a client address that doesn't come with the secret, so it can't be used to dodge the limit", async () => {
    const agent = request.agent(serve());
    for (let i = 0; i < 10; i++) await attempt(agent, { "x-store-client-ip": `203.0.113.${i + 1}`, "x-store-proxy-secret": "wrong" }).expect(401);
    // Ten different made up addresses, one real one: still the same counter, so the 11th is refused.
    expect((await attempt(agent, { "x-store-client-ip": "203.0.113.99" })).status).toBe(429);
  });
});
