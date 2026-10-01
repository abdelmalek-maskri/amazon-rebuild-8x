import Link from "next/link";
import { Suspense } from "react";
import { BasketIcon, HeartIcon, Smile } from "@/components/icons";
import { ApiError, getCategories, type Category } from "@/lib/api";
import { getHeaderState } from "@/lib/server-session";
import { AccountMenu } from "./account-menu";
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
  const [categories, { basketCount, user }] = await Promise.all([loadCategories(), getHeaderState()]);

  return (
    <header>
      <a
        href="#main"
        className="sr-only z-50 bg-surface px-4 py-2 font-bold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded"
      >
        Skip to main content
      </a>

      <div className="bg-nav text-surface">
        <div className="mx-auto flex max-w-375 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:flex-nowrap">
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

          {/* useSearchParams inside needs a Suspense boundary; the fallback is the signed out link's shape. */}
          <div className="ml-auto sm:ml-0">
            <Suspense fallback={<span className="block w-28" />}>
              <AccountMenu user={user} />
            </Suspense>
          </div>

          {/* Guests land on sign in and come back to the list, which the page handles itself. */}
          <Link
            href="/wishlist"
            aria-label="Wish List"
            className="flex shrink-0 items-end gap-1 rounded px-2 py-1 hover:ring-1 hover:ring-surface"
          >
            <HeartIcon className="size-7" />
            {/* Icon only on phones, where the top row already holds the logo, account and basket. */}
            <span aria-hidden className="hidden pb-0.5 text-sm font-bold sm:inline">
              Wish List
            </span>
          </Link>

          <Link
            href="/cart"
            aria-label={`Basket, ${basketCount} ${basketCount === 1 ? "item" : "items"}`}
            className="flex shrink-0 items-end gap-1 rounded px-2 py-1 hover:ring-1 hover:ring-surface"
          >
            {/* Amazon's count sits inside the basket in orange; it shows 0 too, so the icon never jumps. */}
            <span className="relative">
              <BasketIcon />
              <span aria-hidden className="absolute -top-1.5 left-1/2 -translate-x-1/3 text-base leading-none font-bold text-buy">
                {basketCount > 99 ? "99+" : basketCount}
              </span>
            </span>
            <span aria-hidden className="pb-0.5 text-sm font-bold">
              Basket
            </span>
          </Link>
        </div>
      </div>

      {categories.length > 0 && (
        <nav aria-label="Departments" className="bg-nav-light text-surface">
          {/* Scrolls sideways on phones. The fade on the right edge signals there is more to scroll to. */}
          <ul className="mx-auto flex max-w-375 gap-1 overflow-x-auto px-2 text-sm whitespace-nowrap [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:[mask-image:none]">
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
