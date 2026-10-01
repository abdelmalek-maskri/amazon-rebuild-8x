import { cn } from "@/lib/cn";

const STAR = "M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z";

function Star({ fill }: { fill: number }) {
  const pct = Math.round(fill * 100);
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
      <path d={STAR} className="fill-surface stroke-star" strokeWidth="1" />
      {pct > 0 && (
        <path d={STAR} className="fill-star stroke-star" strokeWidth="1" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} />
      )}
    </svg>
  );
}

type RatingProps = { value: number; count?: number; className?: string };

// Partial stars match the real average (4.3 shows a third of a star), and the label reads as one phrase.
export function Rating({ value, count, className }: RatingProps) {
  const label = `${value.toFixed(1)} out of 5 stars${count !== undefined ? `, ${count} ${count === 1 ? "rating" : "ratings"}` : ""}`;
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <span aria-hidden className="font-medium">
        {value.toFixed(1)}
      </span>
      <span className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={Math.min(1, Math.max(0, value - i))} />
        ))}
      </span>
      {count !== undefined && (
        <span aria-hidden className="text-link">
          ({count.toLocaleString("en-US")})
        </span>
      )}
    </span>
  );
}
