import { AppError } from "../../lib/errors.js";
import { availability } from "../catalog/service.js";
import * as repo from "./repo.js";

export const MAX_PER_LINE = 10;

const notInCart = () => new AppError(404, "CART_ITEM_NOT_FOUND", "That item isn't in your basket.");

function checkQuantity(quantity: number, stock: number) {
  if (stock <= 0) throw new AppError(409, "OUT_OF_STOCK", "Sorry, this item is out of stock.");
  if (quantity > stock) {
    throw new AppError(409, "QUANTITY_UNAVAILABLE", `Only ${stock} of this item ${stock === 1 ? "is" : "are"} available.`);
  }
  if (quantity > MAX_PER_LINE) {
    throw new AppError(409, "QUANTITY_LIMIT", `You can buy up to ${MAX_PER_LINE} of each item.`);
  }
}

// Totals are computed here, from current database prices, every time the cart is read.
export async function getCart(cartId: string | undefined) {
  const lines = cartId ? await repo.listLines(cartId) : [];
  const items = lines.map(({ product: { stock, ...product }, ...line }) => ({
    ...line,
    product: { ...product, availability: availability(stock) },
    maxQuantity: Math.min(stock, MAX_PER_LINE),
    lineTotalCents: product.priceCents * line.quantity,
  }));
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotalCents: items.reduce((n, i) => n + i.lineTotalCents, 0),
  };
}

// Which basket a request means: the account's when signed in, otherwise the guest cookie's,
// and only if that cookie points at a basket no account owns.
export async function resolveCartId(userId: string | undefined, guestCartId: string | undefined) {
  if (userId) return repo.userCartId(userId);
  return guestCartId && (await repo.guestCartExists(guestCartId)) ? guestCartId : undefined;
}

// Returns the cart id actually used, which is new when the shopper had no basket yet.
// cartId must come from resolveCartId.
export async function addItem(cartId: string | undefined, productId: string, quantity: number, userId?: string) {
  const knownCart = cartId;
  return repo.transaction(async (tx) => {
    const product = await repo.lockProduct(tx, productId);
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
    // Check the combined quantity before writing. Safe against races: the product row is locked,
    // so two adds of the same product run one after the other.
    const current = knownCart ? await repo.lineQuantity(tx, knownCart, productId) : 0;
    checkQuantity(current + quantity, product.stock);
    const id = knownCart ?? (await repo.createCart(tx, userId));
    await repo.addToLine(tx, id, productId, quantity);
    await repo.touchCart(tx, id);
    return id;
  });
}

export async function updateItem(cartId: string | undefined, itemId: string, quantity: number) {
  if (!cartId) throw notInCart();
  await repo.transaction(async (tx) => {
    const line = await repo.findLine(tx, cartId, itemId);
    if (!line) throw notInCart();
    const product = await repo.lockProduct(tx, line.productId);
    checkQuantity(quantity, product?.stock ?? 0);
    await repo.setLineQuantity(tx, itemId, quantity);
    await repo.touchCart(tx, cartId);
  });
}

export async function removeItem(cartId: string | undefined, itemId: string) {
  if (!cartId || !(await repo.deleteLine(cartId, itemId))) throw notInCart();
}

// On sign in or sign up the guest basket joins the account's. If the account has none, the guest
// basket simply becomes it. Otherwise lines are added together, capped by stock and the per line
// limit, and the guest basket is deleted.
export async function mergeGuestCart(guestCartId: string | undefined, userId: string) {
  if (!guestCartId || !(await repo.guestCartExists(guestCartId))) return;
  const userCart = await repo.userCartId(userId);
  await repo.transaction(async (tx) => {
    const guest = await repo.lockCart(tx, guestCartId);
    if (!guest || guest.userId) return;
    if (!userCart) {
      await repo.claimGuestCart(tx, guestCartId, userId);
      return;
    }
    for (const line of await repo.linesForMerge(tx, guestCartId)) {
      const product = await repo.lockProduct(tx, line.productId);
      const limit = Math.min(product?.stock ?? 0, MAX_PER_LINE);
      const merged = Math.min((await repo.lineQuantity(tx, userCart, line.productId)) + line.quantity, limit);
      if (merged > 0) await repo.setLine(tx, userCart, line.productId, merged);
    }
    await repo.deleteCart(tx, guestCartId);
    await repo.touchCart(tx, userCart);
  });
}
