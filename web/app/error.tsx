"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state";

// Any page whose data fails to load lands here. The message never shows internals; retry refetches.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState
        title="Something went wrong on our side"
        message="We couldn't load this page. It's not something you did. Please try again in a moment."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => retry()}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Go to the home page
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
