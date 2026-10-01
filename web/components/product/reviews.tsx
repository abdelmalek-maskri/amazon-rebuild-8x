import Link from "next/link";
import { Rating } from "@/components/ui/rating";
import type { ReviewPage } from "@/lib/api";
import { cn } from "@/lib/cn";

const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

// Amazon's layout: summary and histogram on the left, reviews on the right. Each bar is a link
// that filters the list, and the filter lives in the URL like everything else.
export function Reviews({ slug, data }: { slug: string; data: ReviewPage }) {
  const base = `/products/${slug}`;
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-10 scroll-mt-4 border-t border-border pt-6">
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="md:w-72 md:shrink-0">
          <h2 id="reviews-title" className="text-xl font-bold">
            Customer reviews
          </h2>
          {data.count > 0 ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <Rating value={data.average} className="[&>span:first-child]:hidden" />
                <span className="text-lg">{data.average.toFixed(1)} out of 5</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {data.count} {data.count === 1 ? "global rating" : "global ratings"}
              </p>
              <ul className="mt-4 flex flex-col gap-1">
                {data.breakdown.map((b) => {
                  const pct = Math.round((b.count / data.count) * 100);
                  const selected = data.stars === b.stars;
                  const row = (
                    <>
                      <span className="w-12 shrink-0">{b.stars} star</span>
                      <span className="h-5 flex-1 overflow-hidden rounded border border-border bg-page">
                        <span className="block h-full bg-star" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-10 shrink-0 text-right">{pct}%</span>
                    </>
                  );
                  return (
                    <li key={b.stars}>
                      {b.count > 0 ? (
                        <Link
                          href={selected ? `${base}#reviews` : `${base}?stars=${b.stars}#reviews`}
                          scroll={false}
                          aria-label={`${b.stars} star, ${pct}% of ratings${selected ? ", showing only these" : ""}`}
                          aria-current={selected || undefined}
                          className={cn("flex min-h-8 items-center gap-2 text-sm text-link hover:text-link-hover", selected && "font-bold")}
                        >
                          {row}
                        </Link>
                      ) : (
                        <span className="flex min-h-8 items-center gap-2 text-sm text-muted">{row}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No reviews yet.</p>
          )}
        </div>

        {data.count > 0 && (
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">
                {data.stars ? `${data.total} ${data.total === 1 ? "review" : "reviews"} with ${data.stars} ${data.stars === 1 ? "star" : "stars"}` : "Top reviews"}
              </h3>
              {data.stars && (
                <Link href={`${base}#reviews`} scroll={false} className="text-sm text-link hover:text-link-hover hover:underline">
                  Show all reviews
                </Link>
              )}
            </div>
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {data.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 py-4">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="grid size-8 place-items-center rounded-full bg-page text-sm font-bold text-muted">
                      {r.authorName.charAt(0)}
                    </span>
                    <span className="text-sm">{r.authorName}</span>
                  </div>
                  <Rating value={r.rating} className="[&>span:first-child]:hidden" />
                  <p className="text-xs text-muted">Reviewed on {dateFormat.format(new Date(r.reviewedAt))}</p>
                  <p className="text-sm">{r.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
