"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, addToWishlist, removeFromWishlist } from "@/lib/api";
import { cn } from "@/lib/cn";

// "Add to List" like Amazon's. Guests get a link to sign in that brings them straight back.
export function SaveToList({ productId, slug, signedIn, initiallySaved }: { productId: string; slug: string; signedIn: boolean; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const style = "flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 text-sm hover:bg-page";

  if (!signedIn) {
    return (
      <Link href={`/signin?next=${encodeURIComponent(`/products/${slug}`)}`} className={style}>
        Add to List
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setError("");
    // Flip straight away, and flip back if the API says no, so it feels instant.
    const next = !saved;
    setSaved(next);
    try {
      await (next ? addToWishlist(productId) : removeFromWishlist(productId));
    } catch (err) {
      setSaved(!next);
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} className={cn(style, saved && "border-link text-link")}>
        <span aria-hidden>{saved ? "♥" : "♡"}</span>
        {saved ? "Saved to your list" : "Add to List"}
      </button>
      {saved && (
        <Link href="/wishlist" className="text-center text-xs text-link hover:text-link-hover hover:underline">
          View your Wish List
        </Link>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
