import { cn } from "@/lib/cn";

// Placeholder shaped like the content it stands in for, so the page doesn't jump when data arrives.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-page", className)} />;
}
