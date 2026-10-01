"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

// Thumbnails beside the main image on desktop, below it on phones, like Amazon's.
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [current, setCurrent] = useState(0);
  const main = images[current] ?? images[0];
  if (!main) return null;

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 && (
        <ul className="flex gap-2 md:flex-col" aria-label="Product images">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setCurrent(i)}
                onMouseEnter={() => setCurrent(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-pressed={i === current}
                className={cn(
                  "relative block size-14 overflow-hidden rounded-lg border-2 bg-page",
                  i === current ? "border-link shadow-[0_0_0_3px_var(--color-focus)]" : "border-border hover:border-muted",
                )}
              >
                <Image src={src} alt="" fill sizes="56px" className="object-contain p-1 mix-blend-multiply" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-page">
        <Image
          src={main}
          alt={images.length > 1 ? `${title}, image ${current + 1} of ${images.length}` : title}
          fill
          preload
          sizes="(min-width: 1024px) 40vw, (min-width: 768px) 50vw, 100vw"
          className="object-contain p-6 mix-blend-multiply"
        />
      </div>
    </div>
  );
}
