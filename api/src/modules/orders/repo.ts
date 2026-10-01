import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cartItems, orderItems, orders, products } from "../../db/schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return db.transaction(fn);
}

// The cart's lines with their products locked, in id order so two checkouts can never deadlock.
export async function lockCartLines(tx: Tx, cartId: string) {
  return tx
    .select({
      productId: products.id,
      title: products.title,
      imageUrl: products.imageUrl,
      priceCents: products.priceCents,
      stock: products.stock,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(products.id))
    .for("update", { of: products });
}

export async function lockProduct(tx: Tx, productId: string) {
  const [row] = await tx
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      priceCents: products.priceCents,
      stock: products.stock,
    })
    .from(products)
    .where(eq(products.id, productId))
    .for("update");
  return row;
}

export async function createOrder(
  tx: Tx,
  // Null for Buy Now: there is no basket to empty when it's paid.
  cartId: string | null,
  userId: string | undefined,
  totalCents: number,
  items: { productId: string; title: string; unitPriceCents: number; quantity: number }[],
) {
  const [order] = await tx.insert(orders).values({ cartId, userId, totalCents }).returning({ id: orders.id });
  await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: order!.id })));
  return order!.id;
}

export async function setSession(orderId: string, sessionId: string) {
  await db.update(orders).set({ stripeSessionId: sessionId }).where(eq(orders.id, orderId));
}

export async function deleteOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

export async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row;
}

export async function itemsForOrder(tx: Tx, orderId: string) {
  return tx
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.productId));
}

export async function lockStock(tx: Tx, productIds: string[]) {
  return tx
    .select({ id: products.id, stock: products.stock })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("update");
}

export async function decrementStock(tx: Tx, productId: string, quantity: number) {
  await tx
    .update(products)
    .set({ stock: sql`${products.stock} - ${quantity}`, updatedAt: new Date() })
    .where(eq(products.id, productId));
}

export async function markOrder(
  tx: Tx,
  orderId: string,
  status: "paid" | "needs_refund",
  email: string | null,
  paymentIntentId: string | null,
) {
  await tx.update(orders).set({ status, email, paidAt: new Date(), stripePaymentIntentId: paymentIntentId }).where(eq(orders.id, orderId));
}

export async function markCancelled(tx: Tx, orderId: string) {
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(orders.id, orderId));
}

// The items never left, so they go back on sale.
export async function restock(tx: Tx, items: { productId: string; quantity: number }[]) {
  for (const i of items) {
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${i.quantity}`, updatedAt: new Date() })
      .where(eq(products.id, i.productId));
  }
}

// Only from a state that is waiting for money back (or a paid order refunded in Stripe's dashboard);
// running twice changes nothing.
export async function markRefunded(orderId: string, refundId: string | null) {
  await db
    .update(orders)
    .set({ status: "refunded", refundedAt: new Date(), stripeRefundId: refundId })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ["cancelled", "needs_refund", "paid"])));
}

export async function findByPaymentIntent(paymentIntentId: string) {
  const [row] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.stripePaymentIntentId, paymentIntentId));
  return row;
}

export async function emptyCart(tx: Tx, cartId: string) {
  await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export async function findOrder(orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      email: orders.email,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      cancelledAt: orders.cancelledAt,
      refundedAt: orders.refundedAt,
      stripePaymentIntentId: orders.stripePaymentIntentId,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return undefined;
  const items = await db
    .select({
      title: orderItems.title,
      unitPriceCents: orderItems.unitPriceCents,
      quantity: orderItems.quantity,
      product: { slug: products.slug, imageUrl: products.imageUrl },
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
  return { ...order, items };
}

// "Your Orders": placed orders only. A pending order is an unfinished payment, not a purchase.
export async function listUserOrders(userId: string, limit: number, offset: number) {
  const where = and(eq(orders.userId, userId), ne(orders.status, "pending"));
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ id: orders.id, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt, paidAt: orders.paidAt })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt), asc(orders.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { rows, total: totalRow?.total ?? 0 };
}

export async function itemsForOrders(orderIds: string[]) {
  if (!orderIds.length) return [];
  return db
    .select({
      orderId: orderItems.orderId,
      title: orderItems.title,
      quantity: orderItems.quantity,
      product: { slug: products.slug, imageUrl: products.imageUrl },
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
}

// Only a paid order counts: cancelled, refunded or unpaid orders never earn a "Verified Purchase".
export async function hasPaidFor(userId: string, productId: string) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.userId, userId), eq(orders.status, "paid"), eq(orderItems.productId, productId)))
    .limit(1);
  return Boolean(row);
}
