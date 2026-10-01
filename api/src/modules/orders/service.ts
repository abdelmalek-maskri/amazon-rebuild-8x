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
export async function checkout(cartId: string | undefined) {
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
    return { orderId: await repo.createOrder(tx, cartId, total, items), lines };
  });

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
        cancel_url: `${env.WEB_URL}/cart`,
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
    await fulfil(event.data.object);
  } else if (event.type === "checkout.session.async_payment_succeeded") {
    await fulfil(event.data.object);
  }
  // Every other event type is acknowledged and ignored.
}

// Runs once per order, however many times Stripe delivers the event: only a pending order moves on.
async function fulfil(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    logger.warn({ sessionId: session.id }, "webhook_without_order");
    return;
  }
  await repo.transaction(async (tx) => {
    const order = await repo.lockOrder(tx, orderId);
    if (!order || order.stripeSessionId !== session.id) {
      logger.warn({ orderId, sessionId: session.id }, "webhook_order_mismatch");
      return;
    }
    if (order.status !== "pending") return;

    const items = await repo.itemsForOrder(tx, orderId);
    const stock = new Map((await repo.lockStock(tx, items.map((i) => i.productId))).map((p) => [p.id, p.stock]));
    const enoughStock = items.every((i) => (stock.get(i.productId) ?? 0) >= i.quantity);
    // The amount Stripe charged must be exactly what we priced; anything else needs a human.
    const amountMatches = session.amount_total === order.totalCents && session.currency === CURRENCY;
    const email = session.customer_details?.email ?? null;

    if (enoughStock && amountMatches) {
      for (const i of items) await repo.decrementStock(tx, i.productId, i.quantity);
      await repo.markOrder(tx, orderId, "paid", email);
      if (order.cartId) await repo.emptyCart(tx, order.cartId);
      logger.info({ orderId }, "order_paid");
    } else {
      // Paid but can't be fulfilled (stock sold out meanwhile): never oversell, flag it for a refund.
      await repo.markOrder(tx, orderId, "needs_refund", email);
      logger.warn({ orderId, enoughStock, amountMatches }, "order_needs_refund");
    }
  });
}

// Shows enough to recognise the address without revealing it to anyone the link is forwarded to.
function maskEmail(email: string | null) {
  if (!email) return null;
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(name.length - 1, 6)))}@${domain}`;
}

export async function getOrder(orderId: string) {
  const order = await repo.findOrder(orderId);
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
  return {
    ...order,
    email: maskEmail(order.email),
    items: order.items.map((i) => ({ ...i, lineTotalCents: i.unitPriceCents * i.quantity })),
  };
}
