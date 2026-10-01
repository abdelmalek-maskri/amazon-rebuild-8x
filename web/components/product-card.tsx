import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { Skeleton } from "@/components/ui/skeleton";
import type { Availability, ProductSummary } from "@/lib/api";

export function AvailabilityNote({ availability }: { availability: Availability }) {
  if (availability.status === "low_stock") return <Badge tone="warning">Only {availability.left} left</Badge>;
  if (availability.status === "out_of_stock") return <Badge tone="danger">Out of stock</Badge>;
  return null;
}

type ProductCardProps = { product: ProductSummary; preload?: boolean };

export function ProductCard({ product, preload }: ProductCardProps) {
  return (
    <article className="group relative flex flex-col gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded bg-page">
        <Image
          src={product.imageUrl}
          alt=""
          fill
          preload={preload}
          sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
          className="object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105"
        />
      </div>
      {/* Always takes a line, so titles stay aligned across a row whether or not a product has a brand. */}
      <p className="min-h-4 text-xs text-muted">{product.brand}</p>
      <h3 className="line-clamp-2 text-sm leading-snug">
        {/* The link covers the whole card, but the accessible name stays just the title. */}
        <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 group-hover:text-link-hover">
          {product.title}
        </Link>
      </h3>
      {product.ratingCount > 0 && <Rating value={product.ratingAvg} count={product.ratingCount} />}
      <Price cents={product.priceCents} />
      <div className="min-h-5">
        <AvailabilityNote availability={product.availability} />
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="aspect-square" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-1/3" />
    </div>
  );
}
