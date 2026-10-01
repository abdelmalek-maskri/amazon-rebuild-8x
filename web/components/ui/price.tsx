import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

type PriceProps = { cents: number; size?: "md" | "lg"; className?: string };

// Amazon's split price ($ and cents raised). Screen readers get the plain "$29.99" instead of three fragments.
export function Price({ cents, size = "md", className }: PriceProps) {
  const [dollars, fraction] = formatPrice(cents).replace("$", "").split(".");
  return (
    <span className={cn("inline-flex items-start leading-none", className)}>
      <span className="sr-only">{formatPrice(cents)}</span>
      <span aria-hidden className={cn("flex items-start", size === "lg" ? "text-3xl" : "text-2xl")}>
        <span className={cn(size === "lg" ? "mt-1 text-sm" : "mt-0.5 text-xs")}>$</span>
        <span className="font-medium">{dollars}</span>
        <span className={cn(size === "lg" ? "mt-1 text-sm" : "mt-0.5 text-xs")}>{fraction}</span>
      </span>
    </span>
  );
}
