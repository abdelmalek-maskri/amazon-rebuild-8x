import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvailabilityNote } from "@/components/product-card";
import { ButtonLink } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { EmptyState } from "@/components/ui/state";
import { WishlistActions } from "@/components/wishlist/wishlist-actions";
import { getServerWishlist } from "@/lib/server-session";

export const metadata: Metadata = { title: "Your Wish List", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function WishlistPage() {
  const wishlist = await getServerWishlist();
  if (!wishlist) redirect(`/signin?next=${encodeURIComponent("/wishlist")}`);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-6 pb-12 sm:px-4">
      <h1 className="text-3xl font-medium">Your Wish List</h1>
      <p className="mt-1 text-sm text-muted">
        {wishlist.total === 0 ? "Nothing saved yet." : `${wishlist.total} ${wishlist.total === 1 ? "item" : "items"} saved`}
      </p>

      {wishlist.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Your Wish List is empty"
          message='Use "Add to List" on any product to save it for later.'
          action={<ButtonLink href="/">Start shopping</ButtonLink>}
        />
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {wishlist.items.map(({ product, addedAt }) => (
            <li key={product.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-4">
                <Link href={`/products/${product.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded bg-page sm:size-28">
                  <Image src={product.imageUrl} alt="" fill sizes="112px" className="object-contain p-2 mix-blend-multiply" />
                </Link>
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/products/${product.slug}`} className="line-clamp-2 text-link hover:text-link-hover">
                    {product.title}
                  </Link>
                  {product.brand && <p className="text-xs text-muted">by {product.brand}</p>}
                  {product.ratingCount > 0 && <Rating value={product.ratingAvg} count={product.ratingCount} />}
                  <Price cents={product.priceCents} />
                  <div className="min-h-5">
                    {product.availability.status === "in_stock" ? (
                      <p className="text-xs text-success">In stock</p>
                    ) : (
                      <AvailabilityNote availability={product.availability} />
                    )}
                  </div>
                  <p className="text-xs text-muted">Added {dateFormat.format(new Date(addedAt))}</p>
                </div>
              </div>
              <WishlistActions productId={product.id} soldOut={product.availability.status === "out_of_stock"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
