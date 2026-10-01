import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "../src/db/index.js";
import { cartItems, orders, products } from "../src/db/schema.js";
import { stripe } from "../src/lib/stripe.js";
import { closeServers, createProduct, resetDb, serve } from "./helpers.js";

const app = serve();
const WEBHOOK_SECRET = "whsec_test_fake";

// Stripe's network call is replaced; everything on our side, including signature checks, is real.
const createSession = vi.spyOn(stripe.checkout.sessions, "create");
let sessionCount = 0;

beforeEach(async () => {
  await resetDb();
  createSession.mockReset();
  createSession.mockImplementation((async () => {
    sessionCount += 1;
    return { id: `cs_test_${sessionCount}`, url: `https://checkout.stripe.test/${sessionCount}` };
  }) as never);
});
afterAll(async () => {
  await closeServers();
  await pool.end();
});

async function basketWith(...lines: { priceCents: number; stock: number; quantity: number }[]) {
  const agent = request.agent(app);
  const made = [];
  for (const l of lines) {
    const product = await createProduct({ priceCents: l.priceCents, stock: l.stock });
    await agent.post("/cart/items").send({ productId: product.id, quantity: l.quantity }).expect(201);
    made.push(product);
  }
  return { agent, products: made };
}

async function checkedOut(...lines: { priceCents: number; stock: number; quantity: number }[]) {
  const basket = await basketWith(...lines);
  const res = await basket.agent.post("/checkout").expect(201);
  const [order] = await db.select().from(orders).where(eq(orders.id, res.body.orderId));
  return { ...basket, order: order! };
}

function sendEvent(type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("Stripe-Signature", signature).send(payload);
}

function paidSession(order: { id: string; stripeSessionId: string | null; totalCents: number }, extra: Record<string, unknown> = {}) {
  return {
    id: order.stripeSessionId,
    payment_status: "paid",
    amount_total: order.totalCents,
    currency: "usd",
    metadata: { orderId: order.id },
    customer_details: { email: "shopper@example.com" },
    ...extra,
  };
}

const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0]!.stock;
const statusOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;

describe("POST /checkout", () => {
  it("refuses an empty basket", async () => {
    expect((await request(app).post("/checkout")).body.error).toBe("CART_EMPTY");
    const product = await createProduct();
    const agent = request.agent(app);
    const added = await agent.post("/cart/items").send({ productId: product.id });
    await agent.delete(`/cart/items/${added.body.items[0].id}`);
    const res = await agent.post("/checkout");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CART_EMPTY");
  });

  it("creates a pending order at database prices and opens one Stripe session for it", async () => {
    const { agent, products: [phone] } = await basketWith({ priceCents: 1000, stock: 5, quantity: 2 }, { priceCents: 250, stock: 5, quantity: 1 });
    // A price change after adding must be what gets charged.
    await db.update(products).set({ priceCents: 1200 }).where(eq(products.id, phone!.id));

    const res = await agent.post("/checkout");
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const [order] = await db.select().from(orders).where(eq(orders.id, res.body.orderId));
    expect(order).toMatchObject({ status: "pending", totalCents: 2650, stripeSessionId: expect.stringMatching(/^cs_test_/) });

    const [params, options] = createSession.mock.calls[0]!;
    // Line order follows product ids (the lock order), so compare as a set.
    const lines = params.line_items!.map((l) => `${l.quantity}x${l.price_data!.unit_amount}`).sort();
    expect(lines).toEqual(["1x250", "2x1200"]);
    expect(params).toMatchObject({ mode: "payment", metadata: { orderId: order!.id }, success_url: `http://localhost:3000/orders/${order!.id}` });
    expect(options).toEqual({ idempotencyKey: `checkout-${order!.id}` });
  });

  it("refuses when stock dropped below the basket, without creating an order", async () => {
    const { agent, products: [p] } = await basketWith({ priceCents: 500, stock: 5, quantity: 3 });
    await db.update(products).set({ stock: 2 }).where(eq(products.id, p!.id));
    const res = await agent.post("/checkout");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("STOCK_CHANGED");
    expect(res.body.message).toMatch(/^Only 2 of Test product are left\./);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("drops the order and says so plainly when Stripe is unavailable", async () => {
    createSession.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));
    const { agent } = await basketWith({ priceCents: 500, stock: 5, quantity: 1 });
    const res = await agent.post("/checkout");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "PAYMENT_UNAVAILABLE", message: "We couldn't start the payment. Please try again in a moment." });
    expect(await db.select().from(orders)).toHaveLength(0);
  });
});

describe("POST /webhooks/stripe", () => {
  it("rejects a missing or forged signature and changes nothing", async () => {
    const { order } = await checkedOut({ priceCents: 500, stock: 5, quantity: 1 });
    const unsigned = await request(app).post("/webhooks/stripe").set("Content-Type", "application/json").send("{}");
    expect(unsigned.status).toBe(400);
    const forged = await sendEvent("checkout.session.completed", paidSession(order), "whsec_attacker");
    expect(forged.status).toBe(400);
    expect(forged.body.error).toBe("INVALID_SIGNATURE");
    expect(await statusOf(order.id)).toBe("pending");
  });

  it("marks the order paid, takes the stock and empties the basket", async () => {
    const { agent, order, products: [a, b] } = await checkedOut({ priceCents: 500, stock: 5, quantity: 2 }, { priceCents: 100, stock: 1, quantity: 1 });
    const res = await sendEvent("checkout.session.completed", paidSession(order));
    expect(res.status).toBe(200);
    expect(await statusOf(order.id)).toBe("paid");
    expect(await stockOf(a!.id)).toBe(3);
    expect(await stockOf(b!.id)).toBe(0);
    expect((await agent.get("/cart")).body.items).toEqual([]);
  });

  it("does nothing the second time Stripe delivers the same payment", async () => {
    const { order, products: [p] } = await checkedOut({ priceCents: 500, stock: 5, quantity: 2 });
    await sendEvent("checkout.session.completed", paidSession(order)).expect(200);
    await sendEvent("checkout.session.completed", paidSession(order)).expect(200);
    expect(await stockOf(p!.id)).toBe(3);
  });

  it("flags the order for a refund instead of overselling when stock ran out meanwhile", async () => {
    const { order, products: [p] } = await checkedOut({ priceCents: 500, stock: 2, quantity: 2 });
    await db.update(products).set({ stock: 1 }).where(eq(products.id, p!.id));
    await sendEvent("checkout.session.completed", paidSession(order)).expect(200);
    expect(await statusOf(order.id)).toBe("needs_refund");
    expect(await stockOf(p!.id)).toBe(1);
  });

  it("flags the order when the amount charged differs from the order total", async () => {
    const { order, products: [p] } = await checkedOut({ priceCents: 500, stock: 5, quantity: 1 });
    await sendEvent("checkout.session.completed", paidSession(order, { amount_total: 1 })).expect(200);
    expect(await statusOf(order.id)).toBe("needs_refund");
    expect(await stockOf(p!.id)).toBe(5);
  });

  it("ignores unpaid sessions, unknown orders and other event types", async () => {
    const { order } = await checkedOut({ priceCents: 500, stock: 5, quantity: 1 });
    await sendEvent("checkout.session.completed", paidSession(order, { payment_status: "unpaid" })).expect(200);
    await sendEvent("checkout.session.completed", paidSession(order, { id: "cs_test_someone_else" })).expect(200);
    await sendEvent("checkout.session.completed", paidSession(order, { metadata: { orderId: crypto.randomUUID() } })).expect(200);
    await sendEvent("payment_intent.created", paidSession(order)).expect(200);
    expect(await statusOf(order.id)).toBe("pending");
    expect(await db.select().from(cartItems)).toHaveLength(1);
  });
});

describe("GET /orders/:id", () => {
  it("shows the items at the prices paid, with the email partly hidden", async () => {
    const { order } = await checkedOut({ priceCents: 500, stock: 5, quantity: 2 });
    await sendEvent("checkout.session.completed", paidSession(order)).expect(200);
    const res = await request(app).get(`/orders/${order.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: order.id, status: "paid", totalCents: 1000, email: "s******@example.com" });
    expect(res.body.items).toEqual([
      { title: "Test product", unitPriceCents: 500, quantity: 2, lineTotalCents: 1000, product: { slug: expect.any(String), imageUrl: expect.any(String) } },
    ]);
  });

  it("returns 404 for an unknown order and 400 for an id that can't exist", async () => {
    expect((await request(app).get(`/orders/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await request(app).get("/orders/1 OR 1=1")).status).toBe(400);
  });
});

describe("order history", () => {
  const signUp = async (email: string) => {
    const agent = request.agent(serve());
    await agent.post("/auth/signup").send({ email, name: "Shopper", password: "a long password" }).expect(201);
    return agent;
  };

  async function buyAs(agent: ReturnType<typeof request.agent>, paid = true) {
    const product = await createProduct({ priceCents: 700, stock: 5 });
    await agent.post("/cart/items").send({ productId: product.id, quantity: 1 }).expect(201);
    const res = await agent.post("/checkout").expect(201);
    const [order] = await db.select().from(orders).where(eq(orders.id, res.body.orderId));
    if (paid) await sendEvent("checkout.session.completed", paidSession(order!)).expect(200);
    return order!;
  }

  it("links an order placed while signed in to that account, and leaves guest orders unlinked", async () => {
    const ada = await signUp("ada@example.com");
    const mine = await buyAs(ada);
    const guest = await buyAs(request.agent(app));
    const [linked] = await db.select().from(orders).where(eq(orders.id, mine.id));
    const [unlinked] = await db.select().from(orders).where(eq(orders.id, guest.id));
    expect(linked!.userId).not.toBeNull();
    expect(unlinked!.userId).toBeNull();
  });

  it("lists only my placed orders, newest first, never pending ones", async () => {
    const ada = await signUp("ada@example.com");
    const bob = await signUp("bob@example.com");
    const first = await buyAs(ada);
    const second = await buyAs(ada);
    await buyAs(ada, false); // checkout started but never paid
    await buyAs(bob);

    const res = await ada.get("/orders");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([second.id, first.id]);
    expect(res.body.items[0]).toMatchObject({ status: "paid", totalCents: 700, itemCount: 1, lines: [{ title: "Test product", quantity: 1 }] });
  });

  it("asks guests to sign in", async () => {
    const res = await request(app).get("/orders");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("SIGN_IN_REQUIRED");
  });

  it("opens an account's order only for that account, even with the link", async () => {
    const ada = await signUp("ada@example.com");
    const bob = await signUp("bob@example.com");
    const order = await buyAs(ada);
    expect((await ada.get(`/orders/${order.id}`)).status).toBe(200);
    expect((await bob.get(`/orders/${order.id}`)).status).toBe(404);
    expect((await request(app).get(`/orders/${order.id}`)).status).toBe(404);
  });

  it("still opens a guest order for anyone with the link", async () => {
    const order = await buyAs(request.agent(app));
    const bob = await signUp("bob@example.com");
    expect((await request(app).get(`/orders/${order.id}`)).status).toBe(200);
    expect((await bob.get(`/orders/${order.id}`)).status).toBe(200);
  });
});
