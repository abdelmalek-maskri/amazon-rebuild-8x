import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cartItems, carts, categories, products } from "../../db/schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A guest cookie only ever opens a guest basket, never one that belongs to an account.
export async function guestCartExists(cartId: string) {
  const [row] = await db.select({ id: carts.id }).from(carts).where(and(eq(carts.id, cartId), isNull(carts.userId)));
  return Boolean(row);
}

export async function userCartId(userId: string) {
  const [row] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId));
  return row?.id;
}

// Lines joined to the live product row: prices and stock always come from the database, never from
// what the cart remembered.
export async function listLines(cartId: string) {
  return db
    .select({
      id: cartItems.id,
      quantity: cartItems.quantity,
      product: {
        id: products.id,
        slug: products.slug,
        title: products.title,
        description: products.description,
        brand: products.brand,
        imageUrl: products.imageUrl,
        priceCents: products.priceCents,
        stock: products.stock,
        // Lets the basket page suggest products from the same departments.
        categorySlug: categories.slug,
      },
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));
}

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return db.transaction(fn);
}

export async function createCart(tx: Tx, userId?: string) {
  const [cart] = await tx.insert(carts).values({ userId }).returning({ id: carts.id });
  return cart!.id;
}

export async function claimGuestCart(tx: Tx, cartId: string, userId: string) {
  await tx.update(carts).set({ userId, updatedAt: new Date() }).where(and(eq(carts.id, cartId), isNull(carts.userId)));
}

export async function lockCart(tx: Tx, cartId: string) {
  const [row] = await tx.select({ id: carts.id, userId: carts.userId }).from(carts).where(eq(carts.id, cartId)).for("update");
  return row;
}

export async function linesForMerge(tx: Tx, cartId: string) {
  return tx
    .select({ productId: cartItems.productId, quantity: cartItems.quantity })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.productId));
}

export async function setLine(tx: Tx, cartId: string, productId: string, quantity: number) {
  await tx
    .insert(cartItems)
    .values({ cartId, productId, quantity })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity, updatedAt: new Date() } });
}

export async function deleteCart(tx: Tx, cartId: string) {
  await tx.delete(carts).where(eq(carts.id, cartId));
}

export async function touchCart(tx: Tx, cartId: string) {
  await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

// Locks the product row so two simultaneous adds can't both pass the stock check.
export async function lockProduct(tx: Tx, productId: string) {
  const [row] = await tx
    .select({ id: products.id, stock: products.stock })
    .from(products)
    .where(eq(products.id, productId))
    .for("update");
  return row;
}

export async function lineQuantity(tx: Tx, cartId: string, productId: string) {
  const [row] = await tx
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  return row?.quantity ?? 0;
}

// Adds to an existing line or creates it, in one statement; returns the resulting quantity.
export async function addToLine(tx: Tx, cartId: string, productId: string, quantity: number) {
  const [row] = await tx
    .insert(cartItems)
    .values({ cartId, productId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.productId],
      set: { quantity: sql`${cartItems.quantity} + excluded.quantity`, updatedAt: new Date() },
    })
    .returning({ id: cartItems.id, quantity: cartItems.quantity });
  return row!;
}

// Scoped by cart id: a line from another cart simply isn't found, so it can't be read or changed.
export async function findLine(tx: Tx, cartId: string, itemId: string) {
  const [row] = await tx
    .select({ id: cartItems.id, productId: cartItems.productId })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
  return row;
}

export async function setLineQuantity(tx: Tx, itemId: string, quantity: number) {
  await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, itemId));
}

export async function deleteLine(cartId: string, itemId: string) {
  const deleted = await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .returning({ id: cartItems.id });
  return deleted.length > 0;
}
