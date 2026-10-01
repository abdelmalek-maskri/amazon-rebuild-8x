"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, cancelOrder } from "@/lib/api";

// Cancelling an already cancelled order only retries the refund, with the same Stripe key.
export function RetryRefund({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, startRefresh] = useTransition();

  async function retry() {
    setBusy(true);
    setError("");
    try {
      await cancelOrder(orderId);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    } finally {
      setBusy(false);
      startRefresh(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={retry} loading={busy || refreshing} className="self-start">
        Retry refund
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
