"use client";

import Image from "next/image";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, checkout, type Cart } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

// returnFocusTo: the opener. The browser would restore focus itself, but the Add to basket button
// is disabled while the request runs, so focus had already left it by the time the drawer opened.
type Show = (cart: Cart, addedProductId: string, returnFocusTo?: HTMLElement | null) => void;

const CartDrawerContext = createContext<Show | null>(null);

export function useCartDrawer() {
  const show = useContext(CartDrawerContext);
  if (!show) throw new Error("useCartDrawer must be used inside CartDrawerProvider");
  return show;
}

// Wide screens get the drawer; phones keep the toast, since a full height panel there covers
// the whole page for a one line confirmation.
export function prefersDrawer() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

export function CartDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ cart: Cart; addedProductId: string; returnFocusTo?: HTMLElement | null } | null>(null);
  const show = useCallback<Show>((cart, addedProductId, returnFocusTo) => setState({ cart, addedProductId, returnFocusTo }), []);
  return (
    <CartDrawerContext.Provider value={show}>
      {children}
      {state && (
        <CartDrawer
          cart={state.cart}
          addedProductId={state.addedProductId}
          onClosed={() => {
            const opener = state.returnFocusTo;
            setState(null);
            // After the drawer unmounts, so nothing steals focus back.
            requestAnimationFrame(() => opener?.focus());
          }}
        />
      )}
    </CartDrawerContext.Provider>
  );
}

// A native modal <dialog>: the browser traps focus inside, makes the page behind inert, closes on
// Escape and hands focus back to the button that opened it. No focus trap code of our own to get wrong.
function CartDrawer({ cart, addedProductId, onClosed }: { cart: Cart; addedProductId: string; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // A modal dialog doesn't stop the page behind from scrolling; this does, until it closes.
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  async function goToCheckout() {
    setRedirecting(true);
    setError("");
    try {
      window.location.assign((await checkout()).url);
    } catch (err) {
      setRedirecting(false);
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    }
  }

  const added = cart.items.find((i) => i.product.id === addedProductId);
  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      onClose={onClosed}
      // A click on the dialog itself (not its panel) is a click on the dimmed backdrop.
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-sm bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="drawer-title" className="flex items-center gap-2 text-lg font-bold text-success">
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-success text-sm text-surface">
              ✓
            </span>
            Added to basket
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-full text-2xl leading-none hover:bg-page"
          >
            ×
          </button>
        </div>

        <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
          {/* The item just added first, then the rest of the basket. */}
          {[...(added ? [added] : []), ...cart.items.filter((i) => i !== added)].map((line) => (
            <li key={line.id} className={cn("flex gap-3 py-4", line === added && "-mx-5 bg-page px-5")}>
              <span className="relative size-16 shrink-0 overflow-hidden rounded bg-surface">
                <Image src={line.product.imageUrl} alt="" fill sizes="64px" className="object-contain p-1" />
              </span>
              <div className="min-w-0 flex-1">
                {line === added && <p className="text-xs font-bold text-success">Just added</p>}
                <Link href={`/products/${line.product.slug}`} onClick={() => ref.current?.close()} className="line-clamp-2 text-sm hover:text-link-hover">
                  {line.product.title}
                </Link>
                <p className="text-xs text-muted">Qty {line.quantity}</p>
              </div>
              <p className="shrink-0 text-sm font-bold">{formatPrice(line.lineTotalCents)}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          <p className="text-lg">
            Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}): <strong>{formatPrice(cart.subtotalCents)}</strong>
          </p>
          <Button fullWidth onClick={goToCheckout} loading={redirecting}>
            Proceed to checkout
          </Button>
          <Link
            href="/cart"
            onClick={() => ref.current?.close()}
            className="flex min-h-11 items-center justify-center rounded-full border border-border text-sm hover:bg-page"
          >
            Go to basket
          </Link>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
