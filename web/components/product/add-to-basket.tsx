"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { prefersDrawer, useCartDrawer } from "@/components/cart/cart-drawer";
import { useToast } from "@/components/ui/toast";
import { addToCart, ApiError, checkout } from "@/lib/api";

// Stays on the product page, instead of Amazon's separate "Added to basket" page full of sponsored
// products: a side drawer with the basket on wide screens, a toast on phones.
export function AddToBasket({ productId, max }: { productId: string; max: number }) {
  const router = useRouter();
  const toast = useToast();
  const showDrawer = useCartDrawer();
  const addRef = useRef<HTMLButtonElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState(false);
  const [, startRefresh] = useTransition();

  async function add() {
    setSaving(true);
    setError("");
    try {
      // The API answers with the whole basket, so the drawer shows exactly what the server holds.
      const cart = await addToCart(productId, quantity);
      if (prefersDrawer()) showDrawer(cart, productId, addRef.current);
      else toast({ title: quantity === 1 ? "Added to basket" : `${quantity} added to basket`, action: { label: "View basket", href: "/cart" } });
      // Re-render the server parts (header count) from the server's own cart, not a local guess.
      startRefresh(() => router.refresh());
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      // The API's messages are written for shoppers ("Only 3 of this item are available.").
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Straight to payment for this item only; the basket is left as it is.
  async function buy() {
    setBuying(true);
    setError("");
    try {
      const { url } = await checkout({ productId, quantity });
      window.location.assign(url);
    } catch (err) {
      setBuying(false);
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span>Quantity</span>
        <select
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="min-h-11 cursor-pointer rounded-lg border border-border bg-page px-3 shadow-sm md:min-h-9"
        >
          {Array.from({ length: max }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      <Button ref={addRef} fullWidth onClick={add} loading={saving} disabled={buying}>
        Add to basket
      </Button>
      <Button fullWidth variant="buy" onClick={buy} loading={buying} disabled={saving}>
        {buying ? "Opening secure payment" : "Buy Now"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
