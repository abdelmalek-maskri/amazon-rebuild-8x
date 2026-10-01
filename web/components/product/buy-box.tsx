import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Availability } from "@/lib/api";
import { cn } from "@/lib/cn";

const MAX_PER_ORDER = 10;

function StockLine({ availability }: { availability: Availability }) {
  const [text, tone] =
    availability.status === "in_stock"
      ? ["In stock", "text-success"]
      : availability.status === "low_stock"
        ? [`Only ${availability.left} left in stock, order soon.`, "text-warning"]
        : ["Currently unavailable.", "text-warning"];
  return <p className={cn("text-lg font-medium", tone)}>{text}</p>;
}

// The server decides what can be bought; this box only offers what is actually available.
export function BuyBox({ priceCents, availability }: { priceCents: number; availability: Availability }) {
  const max = availability.status === "low_stock" ? Math.min(availability.left, MAX_PER_ORDER) : MAX_PER_ORDER;
  const soldOut = availability.status === "out_of_stock";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <Price cents={priceCents} size="lg" />
      <StockLine availability={availability} />
      {soldOut ? (
        <p className="text-sm text-muted">We don&apos;t know when or if this item will be back in stock.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <span>Quantity</span>
            <select name="quantity" defaultValue="1" className="min-h-11 cursor-pointer rounded-lg border border-border bg-page px-3 shadow-sm md:min-h-9">
              {Array.from({ length: max }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {/* Wired to the cart in T11; until then it says so instead of pretending to work. */}
          <Button fullWidth disabled aria-describedby="basket-soon">
            Add to basket
          </Button>
          <p id="basket-soon" className="text-center text-xs text-muted">
            The basket is coming in the next update.
          </p>
        </>
      )}
    </div>
  );
}
