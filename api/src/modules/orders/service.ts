import type Stripe from "stripe";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { stripe } from "../../lib/stripe.js";
import * as repo from "./repo.js";

const CURRENCY = "usd";
// Stripe's minimum. A shorter window means less time between our stock check and payment.
const SESSION_MINUTES = 30;

const emptyBasket = () => new AppError(409, "CART_EMPTY", "Your basket is empty.");

// Prices, totals and stock all come from locked database rows; nothing the browser sent is trusted.
export async function checkout(cartId: string | undefined, userId?: string) {
  if (!cartId) throw emptyBasket();

  const { orderId, lines } = await repo.transaction(async (tx) => {
    const lines = await repo.lockCartLines(tx, cartId);
    if (!lines.length) throw emptyBasket();
    for (const l of lines) {
      if (l.stock < l.quantity) {
        const msg = l.stock <= 0 ? `${l.title} is out of stock.` : `Only ${l.stock} of ${l.title} ${l.stock === 1 ? "is" : "are"} left.`;
        throw new AppError(409, "STOCK_CHANGED", `${msg} Update your basket and try again.`);
      }
    }
    const total = lines.reduce((n, l) => n + l.priceCents * l.quantity, 0);
    const items = lines.map((l) => ({ productId: l.productId, title: l.title, unitPriceCents: l.priceCents, quantity: l.quantity }));
    return { orderId: await repo.createOrder(tx, cartId, userId, total, items), lines };
  });
  return startPayment(orderId, lines, "/cart");
}

// Buy Now: an order for one product, with no basket attached, so paying for it never touches
// what the shopper has in their basket. Same locking and pricing rules as a basket checkout.
export async function buyNow(productId: string, quantity: number, userId?: string) {
  const { orderId, line } = await repo.transaction(async (tx) => {
    const line = await repo.lockProduct(tx, productId);
    if (!line) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
    if (line.stock < quantity) {
      throw new AppError(409, "STOCK_CHANGED", line.stock <= 0 ? "Sorry, this item is out of stock." : `Only ${line.stock} of this item ${line.stock === 1 ? "is" : "are"} available.`);
    }
    const item = { productId: line.productId, title: line.title, unitPriceCents: line.priceCents, quantity };
    return { orderId: await repo.createOrder(tx, null, userId, line.priceCents * quantity, [item]), line };
  });
  return startPayment(orderId, [{ ...line, quantity }], `/products/${line.slug}`);
}

type PaymentLine = { title: string; imageUrl: string; priceCents: number; quantity: number };

async function startPayment(orderId: string, lines: PaymentLine[], cancelPath: string) {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lines.map((l) => ({
          quantity: l.quantity,
          price_data: { currency: CURRENCY, unit_amount: l.priceCents, product_data: { name: l.title, images: [l.imageUrl] } },
        })),
        client_reference_id: orderId,
        metadata: { orderId },
        payment_intent_data: { metadata: { orderId } },
        success_url: `${env.WEB_URL}/orders/${orderId}`,
        cancel_url: `${env.WEB_URL}${cancelPath}`,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      },
      // One order, one session: a retried request can never open a second payment.
      { idempotencyKey: `checkout-${orderId}` },
    );
  } catch (err) {
    // No session means the shopper can't pay for this order; drop it rather than leave it dangling.
    await repo.deleteOrder(orderId);
    logger.error({ err, orderId }, "stripe_session_failed");
    throw new AppError(502, "PAYMENT_UNAVAILABLE", "We couldn't start the payment. Please try again in a moment.");
  }
  if (!session.url) throw new AppError(502, "PAYMENT_UNAVAILABLE", "We couldn't start the payment. Please try again in a moment.");

  await repo.setSession(orderId, session.id);
  logger.info({ orderId, sessionId: session.id }, "order_created");
  return { orderId, url: session.url };
}

export function verifyEvent(rawBody: Buffer, signature: string | undefined) {
  if (!signature) throw new AppError(400, "INVALID_SIGNATURE", "Missing Stripe signature.");
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "webhook_rejected");
    throw new AppError(400, "INVALID_SIGNATURE", "Invalid Stripe signature.");
  }
}

export async function handleEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    await afterPayment(event.data.object);
  } else if (event.type === "checkout.session.async_payment_succeeded") {
    await afterPayment(event.data.object);
  } else if (event.type === "charge.refunded") {
    await syncRefund(event.data.object);
  }
  // Every other event type is acknowledged and ignored.
}

async function afterPayment(session: Stripe.Checkout.Session) {
  const orderId = await fulfil(session);
  // An order that was paid but couldn't be fulfilled gets its money back straight away. If Stripe
  // fails here the webhook answers 500, Stripe redelivers it, and this runs again.
  if (orderId) await refundIfOwed(orderId);
}

// Keeps our status in line with Stripe, including refunds made from Stripe's dashboard.
async function syncRefund(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId || !charge.refunded) return;
  const order = await repo.findByPaymentIntent(paymentIntentId);
  if (!order || order.status === "refunded") return;
  await repo.markRefunded(order.id, charge.refunds?.data[0]?.id ?? null);
  logger.info({ orderId: order.id }, "order_refunded_by_stripe");
}

// Runs once per order, however many times Stripe delivers the event: only a pending order moves on.
// Returns the order id when the session belongs to one of our orders.
async function fulfil(session: Stripe.Checkout.Session): Promise<string | undefined> {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    logger.warn({ sessionId: session.id }, "webhook_without_order");
    return undefined;
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  return repo.transaction(async (tx) => {
    const order = await repo.lockOrder(tx, orderId);
    if (!order || order.stripeSessionId !== session.id) {
      logger.warn({ orderId, sessionId: session.id }, "webhook_order_mismatch");
      return undefined;
    }
    if (order.status !== "pending") return orderId;

    const items = await repo.itemsForOrder(tx, orderId);
    const stock = new Map((await repo.lockStock(tx, items.map((i) => i.productId))).map((p) => [p.id, p.stock]));
    const enoughStock = items.every((i) => (stock.get(i.productId) ?? 0) >= i.quantity);
    // The amount Stripe charged must be exactly what we priced; anything else needs a human.
    const amountMatches = session.amount_total === order.totalCents && session.currency === CURRENCY;
    const email = session.customer_details?.email ?? null;

    if (enoughStock && amountMatches) {
      for (const i of items) await repo.decrementStock(tx, i.productId, i.quantity);
      await repo.markOrder(tx, orderId, "paid", email, paymentIntentId);
      if (order.cartId) await repo.emptyCart(tx, order.cartId);
      logger.info({ orderId }, "order_paid");
    } else {
      // Paid but can't be fulfilled (stock sold out meanwhile): never oversell, flag it for a refund.
      await repo.markOrder(tx, orderId, "needs_refund", email, paymentIntentId);
      logger.warn({ orderId, enoughStock, amountMatches }, "order_needs_refund");
    }
    return orderId;
  });
}

// Simulated shipping: there's no warehouse, so an order "ships" a fixed time after payment.
// Until then it can be cancelled. Long enough for a reviewer to try it, short enough to feel real.
export const SHIPS_AFTER_MS = 30 * 60_000;
const DELIVERED_AFTER_MS = 24 * 60 * 60_000;

const refundFailed = () =>
  new AppError(502, "REFUND_FAILED", "Your order is cancelled, but the refund didn't go through yet. Please try again in a moment.");

// Refunds an order that is owed money and hasn't been refunded. Safe to call any number of times:
// the idempotency key makes Stripe return the same refund instead of creating a second one.
async function refundIfOwed(orderId: string) {
  const order = await repo.findOrder(orderId);
  if (!order || (order.status !== "cancelled" && order.status !== "needs_refund")) return;
  if (!order.stripePaymentIntentId) {
    logger.error({ orderId }, "refund_without_payment_intent");
    throw refundFailed();
  }
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId }, { idempotencyKey: `refund-${orderId}` });
  } catch (err) {
    logger.error({ err, orderId }, "refund_failed");
    throw refundFailed();
  }
  await repo.markRefunded(orderId, refund.id);
  logger.info({ orderId, refundId: refund.id }, "order_refunded");
}

// Cancel before it ships: stock goes back on sale and the payment is refunded. Pressing it again
// after a failed refund simply retries the refund.
export async function cancelOrder(orderId: string, viewerId: string | undefined) {
  const found = await repo.findOrder(orderId);
  if (!found || (found.userId && found.userId !== viewerId)) throw new AppError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");

  if (found.status !== "cancelled") {
    await repo.transaction(async (tx) => {
      const order = await repo.lockOrder(tx, orderId);
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
      if (order.status === "refunded") throw new AppError(409, "ALREADY_REFUNDED", "This order has already been cancelled and refunded.");
      if (order.status === "needs_refund") throw new AppError(409, "REFUND_IN_PROGRESS", "This order is already being refunded.");
      if (order.status !== "paid" || !order.paidAt) throw new AppError(409, "NOT_PAID", "This order hasn't been paid, so there's nothing to cancel.");
      if (Date.now() >= order.paidAt.getTime() + SHIPS_AFTER_MS) {
        throw new AppError(409, "ALREADY_SHIPPED", "This order has already shipped, so it can't be cancelled.");
      }
      await repo.markCancelled(tx, orderId);
      await repo.restock(tx, await repo.itemsForOrder(tx, orderId));
      logger.info({ orderId }, "order_cancelled");
    });
  }
  await refundIfOwed(orderId);
  return getOrder(orderId, viewerId);
}

type Step = { key: string; label: string; at: string | null; done: boolean };

// What the order page draws. Real events come from the order's timestamps; shipping and delivery
// are simulated from the payment time and marked as expected until they pass.
function timeline(o: { status: string; createdAt: Date; paidAt: Date | null; cancelledAt: Date | null; refundedAt: Date | null }, now: number) {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const steps: Step[] = [{ key: "placed", label: "Order placed", at: iso(o.createdAt), done: true }];
  if (!o.paidAt) return { steps, fulfilment: null, canCancel: false, cancelBy: null };
  steps.push({ key: "paid", label: "Payment received", at: iso(o.paidAt), done: true });

  if (o.status === "cancelled" || o.status === "refunded" || o.status === "needs_refund") {
    if (o.cancelledAt) steps.push({ key: "cancelled", label: "Cancelled", at: iso(o.cancelledAt), done: true });
    if (o.status === "needs_refund") {
      steps.push({ key: "unavailable", label: "Couldn't be fulfilled", at: null, done: true });
    }
    steps.push({ key: "refunded", label: o.status === "refunded" ? "Refunded" : "Refund in progress", at: iso(o.refundedAt), done: o.status === "refunded" });
    return { steps, fulfilment: null, canCancel: false, cancelBy: null };
  }

  const ships = new Date(o.paidAt.getTime() + SHIPS_AFTER_MS);
  const delivers = new Date(o.paidAt.getTime() + DELIVERED_AFTER_MS);
  steps.push({ key: "shipped", label: "Shipped", at: ships.toISOString(), done: now >= ships.getTime() });
  steps.push({ key: "delivered", label: "Delivered", at: delivers.toISOString(), done: now >= delivers.getTime() });
  const fulfilment = now >= delivers.getTime() ? "delivered" : now >= ships.getTime() ? "shipped" : "processing";
  return { steps, fulfilment, canCancel: fulfilment === "processing", cancelBy: fulfilment === "processing" ? ships.toISOString() : null };
}

// Shows enough to recognise the address without revealing it to anyone the link is forwarded to.
function maskEmail(email: string | null) {
  if (!email) return null;
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(name.length - 1, 6)))}@${domain}`;
}

// A guest order opens for anyone holding its link. An account's order opens only for that
// account; anyone else gets the same 404 as for an order that doesn't exist.
export async function getOrder(orderId: string, viewerId: string | undefined) {
  const found = await repo.findOrder(orderId);
  if (!found || (found.userId && found.userId !== viewerId)) throw new AppError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
  const { userId: _owner, stripePaymentIntentId: _pi, ...order } = found;
  return {
    ...order,
    ...timeline(order, Date.now()),
    email: maskEmail(order.email),
    items: order.items.map((i) => ({ ...i, lineTotalCents: i.unitPriceCents * i.quantity })),
  };
}

export async function listOrders(userId: string, page: number, pageSize: number) {
  const { rows, total } = await repo.listUserOrders(userId, pageSize, (page - 1) * pageSize);
  const items = await repo.itemsForOrders(rows.map((r) => r.id));
  return {
    items: rows.map((o) => {
      const lines = items.filter((i) => i.orderId === o.id).map(({ orderId: _id, ...line }) => line);
      const { paidAt: _paidAt, ...summary } = o;
      return { ...summary, fulfilment: timeline({ ...o, cancelledAt: null, refundedAt: null }, Date.now()).fulfilment, itemCount: lines.reduce((n, l) => n + l.quantity, 0), lines };
    }),
    total,
    page,
    pageSize,
  };
}

export function hasPaidFor(userId: string, productId: string) {
  return repo.hasPaidFor(userId, productId);
}
