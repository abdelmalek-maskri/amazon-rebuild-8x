import { Price } from "@/components/ui/price";
import type { Availability } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AddToBasket } from "./add-to-basket";
import { SaveToList } from "./save-to-list";

const MAX_PER_ORDER = 10;

function StockLine({ availability }: { availability: Availability }) {
  const [text, tone] =
    availability.status === "in_stock"
      ? ["In stock", "text-success"]
      : availability.status === "low_stock"
        ? [`Only ${availability.left} left in stock, order soon.`, "text-warning"]
        : ["Currently unavailable.", "text-warning"];
  return <p className={cn("text-base font-bold", tone)}>{text}</p>;
}

// The server decides what can be bought; this only offers what is actually available.
type BuyBoxProps = { productId: string; slug: string; priceCents: number; availability: Availability; save: { signedIn: boolean; saved: boolean } };

export function BuyBox({ productId, slug, priceCents, availability, save }: BuyBoxProps) {
  const max = availability.status === "low_stock" ? Math.min(availability.left, MAX_PER_ORDER) : MAX_PER_ORDER;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <Price cents={priceCents} size="lg" />
        <StockLine availability={availability} />
      </div>
      {availability.status === "out_of_stock" ? (
        <p className="text-sm text-muted">We don&apos;t know when or if this item will be back in stock. Save it to your list to find it again.</p>
      ) : (
        <AddToBasket productId={productId} max={max} />
      )}
      {/* Saving works for sold out items too: that's when a list is most useful. */}
      <div className="sm:max-w-56">
        <SaveToList productId={productId} slug={slug} signedIn={save.signedIn} initiallySaved={save.saved} />
      </div>
      {/* Only what is true of this store. No delivery or returns promises it doesn't make. */}
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <li>✓ No account needed to check out</li>
        <li>✓ Card payment handled by Stripe</li>
      </ul>
    </div>
  );
}
