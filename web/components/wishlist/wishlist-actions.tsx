"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ApiError, moveWishlistItemToBasket, removeFromWishlist } from "@/lib/api";

// Move to basket goes through the basket's own stock rules; if it's refused the item stays saved.
export function WishlistActions({ productId, soldOut }: { productId: string; soldOut: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"move" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [refreshing, startRefresh] = useTransition();

  async function run(kind: "move" | "remove") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "move") {
        await moveWishlistItemToBasket(productId);
        toast({ title: "Moved to basket", action: { label: "View basket", href: "/cart" } });
      } else {
        await removeFromWishlist(productId);
      }
      startRefresh(() => router.refresh());
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("move")} loading={busy === "move" || refreshing} disabled={soldOut || busy !== null}>
          Move to basket
        </Button>
        <Button variant="secondary" onClick={() => run("remove")} loading={busy === "remove"} disabled={busy !== null}>
          Remove
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
