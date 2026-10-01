import type { Metadata } from "next";
import { CartLine } from "@/components/cart/cart-line";
import { ProductCard } from "@/components/product-card";
import { CheckoutButton } from "@/components/cart/checkout-button";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import { ApiError, searchProducts, type Cart, type ProductSummary } from "@/lib/api";
import { getServerCart, getServerUser } from "@/lib/server-session";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Basket", robots: { index: false } };

const SUGGESTIONS = 6;

// Products from the basket's own departments, never ones already in it. The basket is still
// useful without them, so a failure here only drops the row.
async function suggestionsFor(cart: Cart): Promise<{ title: string; items: ProductSummary[] }> {
  const inCart = new Set(cart.items.map((i) => i.product.id));
  const departments = [...new Set(cart.items.map((i) => i.product.categorySlug))].slice(0, 2);
  try {
    const pages = departments.length
      ? await Promise.all(departments.map((category) => searchProducts({ category, sort: "featured", inStock: true, pageSize: 12 })))
      : [await searchProducts({ sort: "rating", inStock: true, pageSize: 12 })];
    // Interleave departments so a two-department basket gets suggestions from both.
    const merged = pages.flatMap((p, d) => p.items.map((item, i) => ({ item, rank: i * pages.length + d })));
    const items = merged
      .sort((a, b) => a.rank - b.rank)
      .map((m) => m.item)
      .filter((p) => !inCart.has(p.id))
      .slice(0, SUGGESTIONS);
    return { title: departments.length ? "Customers also viewed" : "Top rated, in stock", items };
  } catch (err) {
    if (err instanceof ApiError) return { title: "", items: [] };
    throw err;
  }
}

export default async function CartPage() {
  const [cart, user] = await Promise.all([getServerCart(), getServerUser()]);
  const suggestions = await suggestionsFor(cart);

  if (cart.items.length === 0) {
    return (
      <div className="flex-1 bg-page pb-12">
        <div className="mx-auto flex max-w-375 flex-col gap-4 px-3 py-4 sm:px-4">
          <div className="bg-surface">
            <EmptyState
              className="border-0"
              title="Your basket is empty"
              message="Find something you like and add it here. No account needed."
              action={<ButtonLink href="/">Continue shopping</ButtonLink>}
            />
          </div>
          <Suggestions title={suggestions.title} items={suggestions.items} />
        </div>
      </div>
    );
  }

  // Checkout only offers to go ahead when every line can actually be bought as it stands.
  const blocked = cart.items.some((i) => i.product.availability.status === "out_of_stock" || i.quantity > i.maxQuantity);
  // Plain bold price inside the sentence, as in Amazon's basket; the split $8⁹⁹ style is for product cards.
  const subtotal = (
    <>
      Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}): <strong className="font-bold">{formatPrice(cart.subtotalCents)}</strong>
    </>
  );

  return (
    <div className="flex-1 bg-page pb-12">
      <div className="mx-auto flex max-w-375 flex-col gap-4 px-3 py-4 sm:px-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <section aria-labelledby="basket" className="flex-1 bg-surface p-4 sm:p-6">
            <div className="flex items-end justify-between border-b border-border pb-3">
              <h1 id="basket" className="text-2xl font-medium sm:text-3xl">
                Shopping Basket
              </h1>
              <span className="hidden text-sm text-muted sm:inline">Price</span>
            </div>
            <ul>
              {cart.items.map((line) => (
                <CartLine key={line.id} line={line} />
              ))}
            </ul>
            <p className="hidden pt-3 text-right text-lg lg:block">{subtotal}</p>
          </section>

          {/* Phones: summary and checkout first, as on Amazon's app, so a long basket never hides the button. */}
          <aside aria-label="Order summary" className="order-first flex flex-col gap-4 lg:sticky lg:top-4 lg:order-none lg:w-80">
            <div className="bg-surface p-4 sm:p-6">
              <p className="text-lg">{subtotal}</p>
              <CheckoutButton blocked={blocked} signedIn={!!user} />
              {/* A nudge, never a gate: guests check out exactly as before. */}
              {!user && (
                <p className="mt-3 border-t border-border pt-3 text-center text-xs">
                  <Link href="/signin?next=/cart" className="text-link hover:text-link-hover hover:underline">
                    Sign in
                  </Link>{" "}
                  to save your basket across devices.
                </p>
              )}
            </div>
            <ul className="hidden flex-col gap-2 bg-surface p-4 text-sm sm:p-6 lg:flex">
              <li>
                <strong>Guest checkout.</strong> No account or sign in needed.
              </li>
              <li>
                <strong>Secure payment.</strong> Card details go straight to Stripe; we never see them.
              </li>
              <li>
                <strong>Your basket is saved</strong> {user ? "to your account, on every device." : "on this device for 30 days."}
              </li>
            </ul>
          </aside>
        </div>

        <Suggestions title={suggestions.title} items={suggestions.items} />
      </div>
    </div>
  );
}

function Suggestions({ title, items }: { title: string; items: ProductSummary[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="suggestions" className="bg-surface p-4 sm:p-6">
      <h2 id="suggestions" className="mb-4 text-xl font-bold">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
