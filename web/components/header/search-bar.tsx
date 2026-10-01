"use client";

import Form from "next/form";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { ApiError, getSuggestions, type Category, type Suggestions } from "@/lib/api";
import { cn } from "@/lib/cn";

const DEBOUNCE_MS = 150;
const MIN_CHARS = 2;

type Cats = Pick<Category, "slug" | "name">[];

// Prefilled from the URL on /search. The key remounts the form when the URL changes, so the box
// always shows what the results are for.
export function SearchBar({ categories }: { categories: Cats }) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  return <SearchForm key={`${q}|${category}`} categories={categories} q={q} category={category} />;
}

type Option = { id: string; href: string } & (
  | { kind: "product"; title: string; brand: string | null; imageUrl: string }
  | { kind: "category"; name: string }
);

// Also the server rendered Suspense fallback: without JavaScript it is a plain GET form to /search.
export function SearchForm({ categories, q = "", category = "" }: { categories: Cats; q?: string; category?: string }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(q);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim();
  useEffect(() => {
    if (query.length < MIN_CHARS) return;
    // Abort the previous request so a slow answer for "hea" can never overwrite the one for "head".
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getSuggestions(query, controller.signal)
        .then((s) => {
          setSuggestions(s);
          setActive(-1);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          // Suggestions are a nicety: on failure the box simply behaves like a plain search box.
          if (err instanceof ApiError) setSuggestions(null);
          else throw err;
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const options: Option[] =
    query.length < MIN_CHARS || !suggestions
      ? []
      : [
          ...suggestions.products.map((p) => ({ kind: "product" as const, id: `${listId}-p-${p.slug}`, href: `/products/${p.slug}`, ...p })),
          ...suggestions.categories.map((c) => ({
            kind: "category" as const,
            id: `${listId}-c-${c.slug}`,
            href: `/search?q=${encodeURIComponent(query)}&category=${c.slug}`,
            name: c.name,
          })),
        ];
  const expanded = open && options.length > 0;

  function go(option: Option) {
    setOpen(false);
    router.push(option.href);
  }

  return (
    <div className="relative">
      <Form action="/search" role="search" className="flex h-11 w-full overflow-hidden rounded-lg bg-surface focus-within:ring-3 focus-within:ring-buy">
        <label htmlFor="search-category" className="sr-only">
          Department
        </label>
        <select
          id="search-category"
          name="category"
          defaultValue={category}
          className="w-16 shrink-0 cursor-pointer border-r border-border bg-page px-2 text-xs text-ink sm:w-auto sm:max-w-40"
        >
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label htmlFor="search-q" className="sr-only">
          Search
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          value={value}
          maxLength={100}
          placeholder="Search the store"
          autoComplete="off"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? options[active]?.id : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (!expanded) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              // -1 means "back in the text box", so the shopper can always return to typing.
              setActive((i) => ((i + 1 + step + options.length + 1) % (options.length + 1)) - 1);
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              go(options[active]!);
            }
          }}
          className="min-w-0 flex-1 px-3 text-base text-ink outline-none placeholder:text-muted"
        />
        <button type="submit" aria-label="Search" className="grid w-12 shrink-0 place-items-center bg-search text-ink hover:bg-buy">
          <SearchIcon />
        </button>
      </Form>

      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-surface py-1 text-ink shadow-xl"
      >
        {options.map((o, i) => (
          <li
            key={o.id}
            id={o.id}
            role="option"
            aria-selected={i === active}
            // mousedown, not click: it fires before the input's blur closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              go(o);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn("flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm", i === active && "bg-page")}
          >
            {o.kind === "product" ? (
              <>
                <span className="relative size-9 shrink-0 overflow-hidden rounded bg-page">
                  <Image src={o.imageUrl} alt="" fill sizes="36px" className="object-contain p-0.5 mix-blend-multiply" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Highlight text={o.title} query={query} />
                  {o.brand && <span className="text-muted"> · {o.brand}</span>}
                </span>
              </>
            ) : (
              <>
                <SearchIcon className="size-4 shrink-0 text-muted" />
                <span>
                  {query} <span className="text-muted">in</span> <span className="font-bold text-link">{o.name}</span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Bold the part the shopper typed, the way Amazon does, so the eye lands on what matched.
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-bold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}
