import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductCard } from "@/components/product-card";
import { BuyBox } from "@/components/product/buy-box";
import { Gallery } from "@/components/product/gallery";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { Reviews } from "@/components/product/reviews";
import { ApiError, getProduct, getProductReviews, searchProducts, type ReviewEligibility, type ReviewPage } from "@/lib/api";
import { getServerReviewEligibility } from "@/lib/server-session";

// One request per render, shared by generateMetadata and the page.
const loadProduct = cache(async (slug: string) => {
  try {
    return await getProduct(slug);
  } catch (err) {
    // 404 for an unknown product, 400 for a slug that can't exist: both are "not found" to a shopper.
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await loadProduct((await params).slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.title,
    description: product.description,
    openGraph: { title: product.title, description: product.description, images: [product.imageUrl] },
  };
}

// Reviews are a section of the page, not the page: if they fail, the product is still shown and buyable.
async function loadReviews(slug: string, stars?: number): Promise<ReviewPage | null> {
  try {
    return await getProductReviews(slug, stars);
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

// Whether to offer the review form. Like the reviews, never worth failing the page over.
async function loadEligibility(slug: string): Promise<ReviewEligibility | null> {
  try {
    return await getServerReviewEligibility(slug);
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[slug]">) {
  const product = await loadProduct((await params).slug);
  // Outside any try/catch: notFound() works by throwing.
  if (!product) notFound();

  // ?stars=5 filters the reviews; anything else is ignored rather than sent to the API.
  const rawStars = (await searchParams).stars;
  const stars = typeof rawStars === "string" && /^[1-5]$/.test(rawStars) ? Number(rawStars) : undefined;
  const [related, reviews, eligibility] = await Promise.all([
    searchProducts({ category: product.category.slug, sort: "featured", pageSize: 7 }),
    loadReviews(product.slug, stars),
    loadEligibility(product.slug),
  ]);
  const more = related.items.filter((p) => p.id !== product.id).slice(0, 6);
  const images = product.images.length ? product.images : [product.imageUrl];

  return (
    <div className="mx-auto w-full max-w-375 px-3 pt-4 pb-12 sm:px-4">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={`/search?category=${product.category.slug}`} className="inline-flex min-h-11 items-center md:min-h-0 text-link hover:text-link-hover hover:underline">
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="line-clamp-1">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_17rem]">
        <Gallery images={images} title={product.title} />

        <div className="flex flex-col gap-3">
          <h1 className="text-2xl leading-tight font-medium">{product.title}</h1>
          {product.brand && (
            <Link href={`/search?brand=${encodeURIComponent(product.brand)}`} className="inline-flex min-h-11 items-center md:min-h-0 self-start text-sm text-link hover:text-link-hover hover:underline">
              Visit the {product.brand} store
            </Link>
          )}
          {product.ratingCount > 0 && (
            <a href="#reviews" className="self-start rounded hover:underline">
              <Rating value={product.ratingAvg} count={product.ratingCount} />
            </a>
          )}
          <hr className="border-border" />
          {/* On phones the buy box sits further down; the price still belongs at the top. */}
          <div className="lg:hidden">
            <Price cents={product.priceCents} size="lg" />
          </div>
          <section aria-labelledby="about">
            <h2 id="about" className="mb-1 font-bold">
              About this item
            </h2>
            <p className="text-sm leading-relaxed">{product.description}</p>
          </section>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            {product.brand && (
              <>
                <dt className="font-bold">Brand</dt>
                <dd>{product.brand}</dd>
              </>
            )}
            <dt className="font-bold">Department</dt>
            <dd>{product.category.name}</dd>
          </dl>
        </div>

        <aside aria-label="Buy" className="md:col-span-2 lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <BuyBox productId={product.id} priceCents={product.priceCents} availability={product.availability} />
          </div>
        </aside>
      </div>

      {reviews && <Reviews slug={product.slug} data={reviews} eligibility={eligibility} />}

      {more.length > 0 && (
        <section aria-labelledby="more" className="mt-10 border-t border-border pt-6">
          <h2 id="more" className="mb-4 text-xl font-bold">
            More in {product.category.name}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {more.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
