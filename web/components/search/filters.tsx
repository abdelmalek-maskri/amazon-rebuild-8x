import Link from "next/link";
import type { ReactNode } from "react";
import { Rating } from "@/components/ui/rating";
import type { ProductPage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { PRICE_RANGES, searchHref, toggle, type SearchState } from "@/lib/search-params";

type FiltersProps = { state: SearchState; facets: ProductPage["facets"] };

// Every option is a plain link to the next URL: works before JavaScript loads, and the back
// button steps back through filter changes.
export function Filters({ state, facets }: FiltersProps) {
  return (
    <div className="flex flex-col gap-6 text-sm">
      <Group title="Department">
        {state.category && (
          <Option href={searchHref(state, { category: undefined })} kind="back">
            Any department
          </Option>
        )}
        {facets.categories.map((c) => (
          <Option key={c.slug} href={searchHref(state, { category: c.slug })} selected={state.category === c.slug} kind="radio" count={c.count}>
            {c.name}
          </Option>
        ))}
      </Group>

      <Group title="Customer reviews">
        {facets.ratings.map((r) => {
          const selected = state.minRating === r.min;
          return (
            <Option
              key={r.min}
              href={searchHref(state, { minRating: selected ? undefined : r.min })}
              selected={selected}
              kind="radio"
              count={r.count}
              label={`${r.min} stars and up`}
            >
              <Rating value={r.min} className="pointer-events-none [&>span:first-child]:hidden" />
              <span>&amp; up</span>
            </Option>
          );
        })}
      </Group>

      {facets.brands.length > 0 && (
        <Group title="Brand">
          {facets.brands.map((b) => (
            <Option key={b.name} href={searchHref(state, { brand: toggle(state.brand, b.name) })} selected={state.brand.includes(b.name)} kind="checkbox" count={b.count}>
              {b.name}
            </Option>
          ))}
        </Group>
      )}

      <Group title="Price">
        {PRICE_RANGES.map((r) => {
          const selected = state.minPrice === r.min && state.maxPrice === r.max;
          return (
            <Option
              key={r.label}
              href={searchHref(state, selected ? { minPrice: undefined, maxPrice: undefined } : { minPrice: r.min, maxPrice: r.max })}
              selected={selected}
              kind="radio"
            >
              {r.label}
            </Option>
          );
        })}
      </Group>

      <Group title="Availability">
        <Option href={searchHref(state, { inStock: !state.inStock })} selected={state.inStock} kind="checkbox">
          In stock only
        </Option>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 font-bold">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

type OptionProps = {
  href: string;
  selected?: boolean;
  kind: "checkbox" | "radio" | "back";
  count?: number;
  label?: string;
  children: ReactNode;
};

function Option({ href, selected = false, kind, count, label, children }: OptionProps) {
  const empty = count === 0 && !selected;
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-label={label ? `${label}${count !== undefined ? `, ${count} results` : ""}${selected ? ", selected" : ""}` : undefined}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded hover:text-link-hover md:min-h-8",
          selected && "font-bold",
          empty && "pointer-events-none text-muted/60",
        )}
        tabIndex={empty ? -1 : undefined}
        aria-disabled={empty || undefined}
      >
        {kind !== "back" && (
          <span
            aria-hidden
            className={cn(
              "grid size-4 shrink-0 place-items-center border",
              kind === "radio" ? "rounded-full" : "rounded-sm",
              selected ? "border-link bg-link text-surface" : "border-muted bg-surface",
            )}
          >
            {selected && (kind === "radio" ? <span className="size-1.5 rounded-full bg-surface" /> : <span className="text-[10px] leading-none">✓</span>)}
          </span>
        )}
        {kind === "back" && <span aria-hidden>‹</span>}
        <span className="flex items-center gap-1">{children}</span>
        {count !== undefined && <span className="text-muted">({count})</span>}
        {selected && !label && <span className="sr-only">(selected)</span>}
      </Link>
    </li>
  );
}
