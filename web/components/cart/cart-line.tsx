"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AvailabilityNote } from "@/components/product-card";
import { ApiError, removeCartItem, updateCartItem, type CartLine as Line } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const stepButton =
  "grid size-11 place-items-center text-lg font-bold disabled:cursor-not-allowed disabled:text-muted/50 md:size-9";

export function CartLine({ line }: { line: Line }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const pending = busy || refreshing;
  const { product } = line;
  const soldOut = product.availability.status === "out_of_stock";
  const tooMany = !soldOut && line.quantity > line.maxQuantity;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      // The server re-renders the whole basket and the header count from its own totals.
      startRefresh(() => router.refresh());
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("flex gap-4 border-b border-border py-4", pending && "opacity-60")} aria-busy={pending || undefined}>
      <Link href={`/products/${product.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded bg-page sm:size-36">
        <Image src={product.imageUrl} alt="" fill sizes="144px" className="object-contain p-2 mix-blend-multiply" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/products/${product.slug}`} className="line-clamp-2 text-base hover:text-link-hover sm:text-lg">
            {product.title}
          </Link>
          {/* Plain bold price, as in Amazon's basket: the split $8⁹⁹ style is for product cards. */}
          <p className="shrink-0 text-lg font-bold">{formatPrice(line.lineTotalCents)}</p>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{product.description}</p>
        {product.brand && <p className="text-xs text-muted">Brand: {product.brand}</p>}
        {line.quantity > 1 && <p className="text-xs text-muted">{line.quantity} × {formatPrice(product.priceCents)}</p>}
        <div className="min-h-5">
          {product.availability.status === "in_stock" ? <p className="text-xs text-success">In stock</p> : <AvailabilityNote availability={product.availability} />}
        </div>

        {/* Stock can drop after something was added; say so here, where it can be fixed. */}
        {soldOut && <p className="text-sm text-danger">This item is no longer available. Remove it to check out.</p>}
        {tooMany && (
          <p className="text-sm text-danger">
            Only {line.maxQuantity} left now. Lower the quantity to check out.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {!soldOut && (
            <div className="flex items-center rounded-full border-2 border-cta-border" role="group" aria-label={`Quantity of ${product.title}`}>
              <button
                type="button"
                className={cn(stepButton, "rounded-l-full")}
                disabled={pending || line.quantity <= 1}
                onClick={() => run(() => updateCartItem(line.id, line.quantity - 1))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-bold" aria-live="polite">
                {line.quantity}
              </span>
              <button
                type="button"
                className={cn(stepButton, "rounded-r-full")}
                disabled={pending || line.quantity >= line.maxQuantity}
                onClick={() => run(() => updateCartItem(line.id, line.quantity + 1))}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          )}
          {tooMany && (
            <button type="button" disabled={pending} onClick={() => run(() => updateCartItem(line.id, line.maxQuantity))} className="min-h-11 text-sm text-link hover:text-link-hover hover:underline md:min-h-0">
              Change to {line.maxQuantity}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => removeCartItem(line.id))}
            className="min-h-11 text-sm text-link hover:text-link-hover hover:underline md:min-h-0"
          >
            Remove
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
