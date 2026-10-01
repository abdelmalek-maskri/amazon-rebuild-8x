"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, cancelOrder } from "@/lib/api";
import { formatPrice } from "@/lib/format";

// Two steps, so a stray tap never cancels an order: ask, then confirm with the amount shown.
export function CancelButton({ orderId, totalCents, cancelBy }: { orderId: string; totalCents: number; cancelBy: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, startRefresh] = useTransition();
  // UTC, matching the timeline: this also renders on the server, which has no idea of the visitor's time zone.
  const until = `${new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" }).format(new Date(cancelBy))} UTC`;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await cancelOrder(orderId);
      startRefresh(() => router.refresh());
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
      // A failed refund still cancelled the order; refresh so the page shows that, with a retry.
      startRefresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirming ? (
        <>
          <Button variant="secondary" onClick={() => setConfirming(true)} className="self-start">
            Cancel order
          </Button>
          <p className="text-xs text-muted">You can cancel until it ships, around {until}.</p>
        </>
      ) : (
        <div role="group" aria-label="Confirm cancellation" className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm">Cancel this order? {formatPrice(totalCents)} goes back to your card.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} loading={busy || refreshing}>
              Yes, cancel and refund
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Keep my order
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
