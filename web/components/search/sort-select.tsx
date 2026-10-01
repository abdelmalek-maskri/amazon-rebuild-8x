"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProductSort } from "@/lib/api";
import { cn } from "@/lib/cn";

type SortSelectProps = { value: ProductSort; options: { value: ProductSort; label: string; href: string }[] };

// The server precomputes each option's URL, so this component only navigates.
export function SortSelect({ value, options }: SortSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const href = options.find((o) => o.value === e.target.value)?.href;
          if (href) startTransition(() => router.push(href, { scroll: false }));
        }}
        className={cn("min-h-11 cursor-pointer rounded-lg border border-border bg-page px-2 shadow-sm md:min-h-9", pending && "opacity-60")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
