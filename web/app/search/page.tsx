import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { Filters } from "@/components/search/filters";
import { Pagination } from "@/components/search/pagination";
import { SortSelect } from "@/components/search/sort-select";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import { ApiError, getCategories, searchProducts, type ProductPage, type ProductSort } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import {
  activeFilterCount,
  PAGE_SIZE,
  parseSearchParams,
  searchHref,
  SORT_LABELS,
  toProductQuery,
  type SearchState,
} from "@/lib/search-params";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q, category } = parseSearchParams(await searchParams);
  if (q) return { title: `Results for “${q}”` };
  if (!category) return { title: "All products" };
  // A failed lookup only costs a less specific tab title, never the page.
  const name = await getCategories()
    .then(({ items }) => items.find((c) => c.slug === category)?.name)
    .catch((err) => {
      if (err instanceof ApiError) return undefined;
      throw err;
    });
  return { title: name ?? "All products" };
}

export default async function SearchPage({ searchParams }: Props) {
  const state = parseSearchParams(await searchParams);
  const [result, { items: departments }] = await Promise.all([searchProducts(toProductQuery(state)), getCategories()]);
  // A selected department with no matches is absent from the counts, yet the chip and the filter
  // list must still name it ("Home & Kitchen", not "home-kitchen") and show it as selected.
  const selected = departments.find((d) => d.slug === state.category);
  if (selected && !result.facets.categories.some((c) => c.slug === selected.slug)) {
    result.facets.categories = [...result.facets.categories, { slug: selected.slug, name: selected.name, count: 0 }].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
  const last = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const filterCount = activeFilterCount(state);

  return (
    <div className="mx-auto max-w-375 px-3 py-4 sm:px-4">
      <ResultsBar state={state} result={result} />
      <ActiveFilters state={state} facets={result.facets} />

      <div className="mt-4 flex flex-col gap-6 md:flex-row">
        {/* Phones: a native disclosure, no JavaScript needed. Desktop: an always open sidebar. */}
        <details className="rounded-lg border border-border md:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-bold">
            Filters{filterCount > 0 && ` (${filterCount})`}
          </summary>
          <div className="border-t border-border p-4">
            <Filters state={state} facets={result.facets} />
          </div>
        </details>
        <aside aria-label="Filters" className="hidden w-56 shrink-0 md:block">
          <Filters state={state} facets={result.facets} />
        </aside>

        <section aria-label="Results" className="min-w-0 flex-1">
          {result.items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {result.items.map((p, i) => (
                  <ProductCard key={p.id} product={p} preload={i < 4} />
                ))}
              </div>
              <Pagination state={state} last={last} />
            </>
          ) : (
            <NoResults state={state} total={result.total} />
          )}
        </section>
      </div>
    </div>
  );
}

function ResultsBar({ state, result }: { state: SearchState; result: ProductPage }) {
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);
  const sorts = (Object.keys(SORT_LABELS) as ProductSort[])
    .filter((s) => s !== "relevance" || state.q)
    .map((s) => ({ value: s, label: SORT_LABELS[s], href: searchHref(state, { sort: s }) }));

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-sm" aria-live="polite">
        {result.total === 0 ? (
          "No results"
        ) : result.items.length === 0 ? (
          // Past the last page: a "from–to" range would read like 2353–184.
          <>
            {result.total} {result.total === 1 ? "result" : "results"}
          </>
        ) : (
          <>
            {from}–{to} of {result.total} {result.total === 1 ? "result" : "results"}
          </>
        )}
        {state.q && (
          <>
            {" "}
            for <span className="font-bold text-warning">“{state.q}”</span>
          </>
        )}
      </h1>
      <SortSelect value={result.sort} options={sorts} />
    </div>
  );
}

// Removable chips for everything applied, so the shopper always sees why the list looks the way it does.
function ActiveFilters({ state, facets }: { state: SearchState; facets: ProductPage["facets"] }) {
  const chips: { label: string; href: string }[] = [];
  if (state.category) {
    const name = facets.categories.find((c) => c.slug === state.category)?.name ?? state.category;
    chips.push({ label: name, href: searchHref(state, { category: undefined }) });
  }
  for (const b of state.brand) chips.push({ label: b, href: searchHref(state, { brand: state.brand.filter((x) => x !== b) }) });
  if (state.minPrice !== undefined || state.maxPrice !== undefined) {
    const label =
      state.minPrice !== undefined && state.maxPrice !== undefined
        ? `${formatPrice(state.minPrice)} to ${formatPrice(state.maxPrice)}`
        : state.minPrice !== undefined
          ? `${formatPrice(state.minPrice)} & above`
          : `Under ${formatPrice(state.maxPrice!)}`;
    chips.push({ label, href: searchHref(state, { minPrice: undefined, maxPrice: undefined }) });
  }
  if (state.minRating) chips.push({ label: `${state.minRating} stars & up`, href: searchHref(state, { minRating: undefined }) });
  if (state.inStock) chips.push({ label: "In stock only", href: searchHref(state, { inStock: false }) });
  if (!chips.length) return null;

  return (
    <ul aria-label="Applied filters" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {chips.map((c) => (
        <li key={c.label}>
          <Link
            href={c.href}
            scroll={false}
            aria-label={`Remove filter: ${c.label}`}
            className="flex min-h-9 items-center gap-2 rounded-full border border-border bg-page px-3 hover:border-ink"
          >
            {c.label} <span aria-hidden>×</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={searchHref({ ...state, category: undefined, brand: [], minPrice: undefined, maxPrice: undefined, minRating: undefined, inStock: false })} scroll={false} className="px-2 text-link hover:text-link-hover hover:underline">
          Clear all
        </Link>
      </li>
    </ul>
  );
}

function NoResults({ state, total }: { state: SearchState; total: number }) {
  // Past the last page of a real result set: offer the way back rather than "no results".
  if (total > 0) {
    return (
      <EmptyState
        title="There's nothing on this page"
        message="The results have fewer pages than this link expects."
        action={<ButtonLink href={searchHref(state, { page: 1 })}>Back to page 1</ButtonLink>}
      />
    );
  }
  // Searching inside one department is the commonest dead end ("head" in Home & Kitchen): offer everywhere first.
  if (state.q && state.category) {
    return (
      <EmptyState
        title={`No results for “${state.q}” in this department`}
        message="It may be in another one."
        action={<ButtonLink href={searchHref({ ...state, category: undefined })}>Search all departments</ButtonLink>}
      />
    );
  }
  const hasFilters = activeFilterCount(state) > 0;
  return (
    <EmptyState
      title={state.q ? `No results for “${state.q}”` : "No products match these filters"}
      message={hasFilters ? "Try removing a filter or two." : "Check the spelling, or try a more general word."}
      action={
        hasFilters ? (
          <ButtonLink href={searchHref({ ...state, category: undefined, brand: [], minPrice: undefined, maxPrice: undefined, minRating: undefined, inStock: false })}>
            Clear all filters
          </ButtonLink>
        ) : (
          <ButtonLink href="/search" variant="secondary">
            Browse all products
          </ButtonLink>
        )
      }
    />
  );
}
