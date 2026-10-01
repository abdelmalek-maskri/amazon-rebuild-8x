import { ProductCardSkeleton } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the home page so nothing jumps when the real content streams in.
export default function Loading() {
  return (
    <div className="flex-1 bg-page pb-12" aria-busy="true" aria-label="Loading">
      <div className="bg-nav-light px-4 pt-10 pb-16 sm:pt-14">
        <Skeleton className="mx-auto h-9 w-2/3 max-w-lg bg-surface/15" />
      </div>
      <div className="mx-auto -mt-10 flex max-w-375 flex-col gap-6 px-3 sm:px-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 bg-surface p-5">
              <Skeleton className="h-6 w-1/2" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="aspect-square" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 bg-surface p-5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
