import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";

export default function ProductNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <EmptyState
        title="We couldn't find that product"
        message="It may have been removed, or the link may be wrong. Try searching for it instead."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/search">Browse all products</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go to the home page
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
