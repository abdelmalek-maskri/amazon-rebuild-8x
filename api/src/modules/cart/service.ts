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

// Returns the cart id actually used, which is new when the shopper had no (valid) cart yet.
export async function addItem(cartId: string | undefined, productId: string, quantity: number) {
  const knownCart = cartId && (await repo.cartExists(cartId)) ? cartId : undefined;
  return repo.transaction(async (tx) => {
    const product = await repo.lockProduct(tx, productId);
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
    // Check the combined quantity before writing. Safe against races: the product row is locked,
    // so two adds of the same product run one after the other.
    const current = knownCart ? await repo.lineQuantity(tx, knownCart, productId) : 0;
    checkQuantity(current + quantity, product.stock);
    const id = knownCart ?? (await repo.createCart(tx));
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
