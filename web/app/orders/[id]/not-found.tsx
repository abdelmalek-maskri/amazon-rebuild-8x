import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";

export default function OrderNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <EmptyState
        title="We couldn't find that order"
        message="Check that the link is complete. Order links are long on purpose: they're the key to the order."
        action={<ButtonLink href="/">Go to the home page</ButtonLink>}
      />
    </div>
  );
}
