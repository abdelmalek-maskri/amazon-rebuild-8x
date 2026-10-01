import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        title="We couldn't find that page"
        message="The link may be old, or the page may have moved. Try searching from the bar above."
        action={<ButtonLink href="/">Go to the home page</ButtonLink>}
      />
    </div>
  );
}
