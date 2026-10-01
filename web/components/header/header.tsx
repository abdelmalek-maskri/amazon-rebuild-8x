import Link from "next/link";
import { Suspense } from "react";
import { BasketIcon, Smile } from "@/components/icons";
import { ApiError, getCategories, type Category } from "@/lib/api";
import { SITE_NAME } from "@/lib/site";
import { SearchBar, SearchForm } from "./search-bar";

async function loadCategories(): Promise<Category[]> {
  try {
    return (await getCategories()).items;
  } catch (err) {
    // The header must never take the page down: without categories, search still works across "All".
    if (err instanceof ApiError) return [];
    throw err;
  }
}

export async function Header() {
  const categories = await loadCategories();

  return (
    <header>
      <a
        href="#main"
        className="sr-only z-50 bg-surface px-4 py-2 font-bold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded"
      >
        Skip to main content
      </a>

      <div className="bg-nav text-surface">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:flex-nowrap">
          <Link href="/" className="flex shrink-0 flex-col items-start rounded px-1 pt-1 pb-0.5 outline-offset-0 hover:ring-1 hover:ring-surface">
            <span className="text-2xl leading-none font-bold tracking-tight">{SITE_NAME.toLowerCase()}</span>
            <Smile className="-mt-0.5 h-2.5 w-14 text-buy" />
          </Link>

          {/* On phones the search drops to its own full width row under the logo and basket. */}
          <div className="order-last w-full sm:order-none sm:flex-1">
            <Suspense fallback={<SearchForm categories={categories} />}>
              <SearchBar categories={categories} />
            </Suspense>
          </div>

          <Link
            href="/cart"
            className="ml-auto flex shrink-0 items-end gap-1 rounded px-2 py-1 hover:ring-1 hover:ring-surface sm:ml-0"
          >
            <BasketIcon />
            <span className="pb-0.5 text-sm font-bold">Basket</span>
          </Link>
        </div>
      </div>

      {categories.length > 0 && (
        <nav aria-label="Departments" className="bg-nav-light text-surface">
          {/* Scrolls sideways on phones. The fade on the right edge signals there is more to scroll to. */}
          <ul className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-2 text-sm whitespace-nowrap [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:[mask-image:none]">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/search?category=${c.slug}`} className="block rounded px-2 py-2 hover:ring-1 hover:ring-surface">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
