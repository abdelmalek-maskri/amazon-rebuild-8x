"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, checkout } from "@/lib/api";

// The server creates the order from the basket it holds, then hands back Stripe's payment page.
export function CheckoutButton({ blocked }: { blocked: boolean }) {
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  async function go() {
    setRedirecting(true);
    setError("");
    try {
      const { url } = await checkout();
      // A full navigation: Stripe's page is another site.
      window.location.assign(url);
    } catch (err) {
      setRedirecting(false);
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    }
  }

  return (
    <>
      <Button fullWidth className="mt-4" disabled={blocked} loading={redirecting} onClick={go} aria-describedby="checkout-note">
        {redirecting ? "Opening secure payment" : "Proceed to checkout"}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-center text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="checkout-note" className="mt-2 text-center text-xs text-muted">
          {blocked ? "Fix the items marked in red to check out." : "You'll pay on Stripe's secure page. Test mode: use card 4242 4242 4242 4242."}
        </p>
      )}
    </>
  );
}
