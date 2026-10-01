"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import type { Category } from "@/lib/api";
import { SearchIcon } from "@/components/icons";

// Prefilled from the URL on /search, so the shopper sees and can tweak what they searched for.
export function SearchBar({ categories }: { categories: Pick<Category, "slug" | "name">[] }) {
  const params = useSearchParams();
  return <SearchForm categories={categories} q={params.get("q") ?? ""} category={params.get("category") ?? ""} />;
}

// Same form without URL state: rendered on the server as the Suspense fallback, so it works before JS loads.
export function SearchForm({ categories, q = "", category = "" }: { categories: Pick<Category, "slug" | "name">[]; q?: string; category?: string }) {
  return (
    <Form action="/search" role="search" className="flex h-11 w-full overflow-hidden rounded-lg bg-surface focus-within:ring-3 focus-within:ring-buy">
      <label htmlFor="search-category" className="sr-only">
        Department
      </label>
      {/* key: a new URL resets the uncontrolled fields to the new values. */}
      <select
        key={`c-${category}`}
        id="search-category"
        name="category"
        defaultValue={category}
        className="w-16 shrink-0 cursor-pointer sm:w-auto sm:max-w-40 border-r border-border bg-page px-2 text-xs text-ink"
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
        key={`q-${q}`}
        id="search-q"
        name="q"
        type="search"
        defaultValue={q}
        maxLength={100}
        placeholder="Search the store"
        autoComplete="off"
        className="min-w-0 flex-1 px-3 text-base text-ink outline-none placeholder:text-muted"
      />
      <button type="submit" aria-label="Search" className="grid w-12 shrink-0 place-items-center bg-search text-ink hover:bg-buy">
        <SearchIcon />
      </button>
    </Form>
  );
}
