import { ProductCardSkeleton } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-375 px-3 pt-4 pb-12 sm:px-4" aria-busy="true" aria-label="Loading results">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="mt-4 flex gap-6">
        <div className="hidden w-56 shrink-0 flex-col gap-3 md:flex">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-40" />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
