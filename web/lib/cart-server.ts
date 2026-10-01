import { cookies } from "next/headers";
import { ApiError, getCart, type Cart } from "@/lib/api";

const EMPTY: Cart = { items: [], itemCount: 0, subtotalCents: 0 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server components only. Forwards just the cart cookie, never the shopper's other cookies.
export async function getServerCart(): Promise<Cart> {
  const id = (await cookies()).get("cart_id")?.value;
  if (!id || !UUID.test(id)) return EMPTY;
  return getCart(id);
}

// For the header: the basket count is never worth breaking the page over.
export async function getServerCartCount(): Promise<number> {
  try {
    return (await getServerCart()).itemCount;
  } catch (err) {
    if (err instanceof ApiError) return 0;
    throw err;
  }
}
