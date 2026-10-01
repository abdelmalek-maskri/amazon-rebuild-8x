import { cookies } from "next/headers";
import { ApiError, getCart, getMe, getOrder, getReviewEligibility, listOrders, type Cart, type User } from "@/lib/api";

const EMPTY: Cart = { items: [], itemCount: 0, subtotalCents: 0 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// Server components call the API directly, so the shopper's cookies don't travel by themselves.
// Forward exactly the two the API uses, and only if they look like ours; never anything else.
async function forwardedCookie(): Promise<string | undefined> {
  const jar = await cookies();
  const parts: string[] = [];
  const session = jar.get("session")?.value;
  const cartId = jar.get("cart_id")?.value;
  if (session && TOKEN.test(session)) parts.push(`session=${session}`);
  if (cartId && UUID.test(cartId)) parts.push(`cart_id=${cartId}`);
  return parts.length ? parts.join("; ") : undefined;
}

export async function getServerCart(): Promise<Cart> {
  const cookie = await forwardedCookie();
  return cookie ? getCart(cookie) : EMPTY;
}

export async function getServerUser(): Promise<User | null> {
  const cookie = await forwardedCookie();
  return cookie ? (await getMe(cookie)).user : null;
}

// For the header: neither the count nor the greeting is worth breaking a page over.
export async function getHeaderState(): Promise<{ basketCount: number; user: User | null }> {
  const [cart, user] = await Promise.allSettled([getServerCart(), getServerUser()]);
  for (const r of [cart, user]) if (r.status === "rejected" && !(r.reason instanceof ApiError)) throw r.reason;
  return {
    basketCount: cart.status === "fulfilled" ? cart.value.itemCount : 0,
    user: user.status === "fulfilled" ? user.value : null,
  };
}

export async function getServerOrder(id: string) {
  return getOrder(id, await forwardedCookie());
}

// Null when signed out, so the page can send the shopper to sign in.
export async function getServerOrders(page = 1) {
  const cookie = await forwardedCookie();
  if (!cookie || !(await getServerUser())) return null;
  return listOrders(cookie, page);
}

export async function getServerReviewEligibility(slug: string) {
  return getReviewEligibility(slug, await forwardedCookie());
}
