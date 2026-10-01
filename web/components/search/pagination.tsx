import Link from "next/link";
import { cn } from "@/lib/cn";
import { searchHref, type SearchState } from "@/lib/search-params";

// First, last, and two either side of the current page, with gaps marked: 1 … 4 5 [6] 7 8 … 20.
function pageWindow(page: number, last: number) {
  const pages = new Set([1, last]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= last) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1]! > 1 ? (["gap", p] as const) : [p]));
}

export function Pagination({ state, last }: { state: SearchState; last: number }) {
  if (last <= 1) return null;
  const cell = "grid min-h-11 min-w-11 place-items-center rounded-lg border px-3 text-sm";
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {state.page > 1 ? (
        <Link href={searchHref(state, { page: state.page - 1 })} className={cn(cell, "border-border hover:bg-page")} rel="prev">
          ‹ Previous
        </Link>
      ) : (
        <span className={cn(cell, "border-border text-muted/60")} aria-disabled>
          ‹ Previous
        </span>
      )}
      {pageWindow(state.page, last).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-muted">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={searchHref(state, { page: p })}
            aria-current={p === state.page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={cn(cell, p === state.page ? "border-ink font-bold" : "border-border hover:bg-page")}
          >
            {p}
          </Link>
        ),
      )}
      {state.page < last ? (
        <Link href={searchHref(state, { page: state.page + 1 })} className={cn(cell, "border-border hover:bg-page")} rel="next">
          Next ›
        </Link>
      ) : (
        <span className={cn(cell, "border-border text-muted/60")} aria-disabled>
          Next ›
        </span>
      )}
    </nav>
  );
}
