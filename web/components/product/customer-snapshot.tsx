import { Rating } from "@/components/ui/rating";
import type { Review, ReviewPage } from "@/lib/api";

// "What customers say" near the top: the shape of the ratings, plus the best and the most
// critical review in full, so a shopper sees both sides before scrolling.
export function CustomerSnapshot({ data }: { data: ReviewPage }) {
  if (data.count === 0) return null;
  const byRating = [...data.items].sort((a, b) => b.rating - a.rating);
  const best = byRating[0];
  const critical = byRating.at(-1);
  const quotes = [best, critical && critical.rating < 4 && critical !== best ? critical : undefined].filter((r): r is Review => Boolean(r));

  return (
    <section aria-labelledby="snapshot" className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="snapshot" className="font-bold">
          What customers say
        </h2>
        <a href="#reviews" className="text-sm text-link hover:text-link-hover hover:underline">
          See all {data.count} {data.count === 1 ? "review" : "reviews"}
        </a>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[10rem_1fr]">
        <ul className="flex flex-col gap-1" aria-label="Ratings by star">
          {data.breakdown.map((b) => {
            const pct = Math.round((b.count / data.count) * 100);
            return (
              <li key={b.stars} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-right" aria-hidden>
                  {b.stars}
                </span>
                <span className="sr-only">{`${b.stars} star: ${pct}%`}</span>
                <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-page">
                  <span className="block h-full bg-star" style={{ width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-col gap-3">
          {quotes.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Rating value={r.rating} className="[&>span:first-child]:hidden" />
                <span className="text-xs text-muted">{r.rating >= 4 ? "Top positive" : "Top critical"}</span>
                {r.verified && <span className="text-xs font-bold text-link-hover">Verified Purchase</span>}
              </div>
              <p className="text-sm">&ldquo;{r.body}&rdquo;</p>
              <p className="text-xs text-muted">{r.authorName}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
