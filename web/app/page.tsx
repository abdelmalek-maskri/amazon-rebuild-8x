import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductCard } from "@/components/product-card";
import { getCategories, searchProducts, type ProductSummary } from "@/lib/api";

// No hero carousel: Amazon's cuts its own headlines mid word. Departments and real products instead.
export default async function Home() {
  const [{ items: categories }, topRated, underTwentyFive] = await Promise.all([
    getCategories(),
    searchProducts({ sort: "rating", inStock: true, pageSize: 6 }),
    // Over-fetch so the row can skip anything already shown under "Top rated".
    searchProducts({ maxPrice: 2500, sort: "rating", inStock: true, pageSize: 12 }),
  ]);
  const shown = new Set(topRated.items.map((p) => p.id));
  const bargains = underTwentyFive.items.filter((p) => !shown.has(p.id)).slice(0, 6);
  const previews = await Promise.all(
    categories.map((c) => searchProducts({ category: c.slug, sort: "featured", pageSize: 4 }).then((p) => p.items)),
  );

  return (
    <div className="bg-page pb-4">
      <section className="bg-linear-to-b from-nav-light to-page px-4 pt-10 pb-16 text-center sm:pt-14">
        <h1 className="text-3xl font-bold text-surface sm:text-4xl">Everything you need. Nothing in the way.</h1>
      </section>

      <div className="mx-auto -mt-10 flex max-w-[1500px] flex-col gap-6 px-3 sm:px-4">
        <section aria-labelledby="departments" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 id="departments" className="sr-only">
            Shop by department
          </h2>
          {categories.map((c, i) => (
            <DepartmentCard key={c.slug} slug={c.slug} name={c.name} count={c.productCount} products={previews[i] ?? []} preload={i < 4} />
          ))}
        </section>

        <ProductRow title="Top rated, in stock" href="/search?sort=rating&inStock=true" products={topRated.items} />
        <ProductRow title="Great finds under $25" href="/search?maxPrice=2500&sort=rating" products={bargains} />
      </div>
    </div>
  );
}

function DepartmentCard({ slug, name, count, products, preload }: { slug: string; name: string; count: number; products: ProductSummary[]; preload: boolean }) {
  return (
    <article className="flex flex-col bg-surface p-5">
      <h3 className="text-xl font-bold">Shop {name}</h3>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-3">
        {products.map((p) => (
          <Link key={p.id} href={`/products/${p.slug}`} className="group flex flex-col gap-1">
            <span className="relative aspect-square overflow-hidden bg-page">
              <Image
                src={p.imageUrl}
                alt=""
                fill
                preload={preload}
                sizes="(min-width: 1024px) 12vw, (min-width: 640px) 22vw, 45vw"
                className="object-contain p-2 mix-blend-multiply transition-transform group-hover:scale-105"
              />
            </span>
            <span className="line-clamp-1 text-xs group-hover:text-link-hover">{p.title}</span>
          </Link>
        ))}
      </div>
      <Link href={`/search?category=${slug}`} className="mt-4 text-sm text-link hover:text-link-hover hover:underline">
        See all {count} in {name}
      </Link>
    </article>
  );
}

function ProductRow({ title, href, products }: { title: string; href: string; products: ProductSummary[] }): ReactNode {
  if (!products.length) return null;
  return (
    <section className="bg-surface p-5">
      <div className="mb-4 flex items-baseline gap-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link href={href} className="text-sm text-link hover:text-link-hover hover:underline">
          See more
        </Link>
      </div>
      {/* A grid that wraps, not a sideways scroller: every product is fully visible at every width. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
