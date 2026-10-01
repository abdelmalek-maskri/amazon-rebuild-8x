import { AppError } from "../../lib/errors.js";
import * as cart from "../cart/service.js";
import { availability } from "../catalog/service.js";
import * as repo from "./repo.js";

const signIn = () => new AppError(401, "SIGN_IN_REQUIRED", "Sign in to use your Wish List.");
const notSaved = () => new AppError(404, "NOT_IN_WISHLIST", "That item isn't in your Wish List.");

function requireUser(userId: string | undefined): string {
  if (!userId) throw signIn();
  return userId;
}

export async function getWishlist(userId: string | undefined) {
  const rows = await repo.list(requireUser(userId));
  // Same rule as everywhere else: stock is shown as a status, never as a raw count.
  const items = rows.map(({ product: { stock, ...product }, addedAt }) => ({ addedAt, product: { ...product, availability: availability(stock) } }));
  return { items, total: items.length };
}

export async function addItem(userId: string | undefined, productId: string) {
  const id = requireUser(userId);
  if (!(await repo.productExists(productId))) throw new AppError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product. It may have been removed.");
  await repo.add(id, productId);
  return getWishlist(id);
}

export async function removeItem(userId: string | undefined, productId: string) {
  const id = requireUser(userId);
  if (!(await repo.remove(id, productId))) throw notSaved();
  return getWishlist(id);
}

export async function status(userId: string | undefined, productId: string) {
  return { saved: userId ? await repo.contains(userId, productId) : false };
}

// Through the cart service, so stock and the 10 per item limit apply exactly as for Add to basket.
// Only once the basket accepts it does the item leave the list; a refusal leaves it saved.
export async function moveToBasket(userId: string | undefined, productId: string) {
  const id = requireUser(userId);
  if (!(await repo.contains(id, productId))) throw notSaved();
  await cart.addItem(await cart.resolveCartId(id, undefined), productId, 1, id);
  await repo.remove(id, productId);
  return getWishlist(id);
}
