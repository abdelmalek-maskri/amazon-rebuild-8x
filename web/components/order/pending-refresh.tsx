"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 60_000;

// Stripe's "paid" message usually lands within seconds of the redirect. Until it does, re-ask the
// server; the page (and the header count) re-render from the real order state each time.
export function PendingRefresh() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_AFTER_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);

  return gaveUp ? (
    <p className="text-sm text-muted">
      This is taking longer than usual. Your payment is safe with Stripe; check back on this page in a few minutes.
    </p>
  ) : (
    <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted/30 border-t-muted" />
      Confirming your payment with Stripe…
    </p>
  );
}
