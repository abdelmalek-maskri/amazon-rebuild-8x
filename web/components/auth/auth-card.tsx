import Link from "next/link";
import type { ReactNode } from "react";
import { Smile } from "@/components/icons";
import { SITE_NAME } from "@/lib/site";

// Amazon's sign in layout: the logo, then one narrow card, then a way to the other page.
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-8">
      <Link href="/" className="flex flex-col items-center text-ink">
        <span className="text-3xl leading-none font-bold tracking-tight">{SITE_NAME.toLowerCase()}</span>
        <Smile className="-mt-0.5 h-3 w-16 text-buy" />
      </Link>
      <div className="w-full rounded-lg border border-border p-6">
        <h1 className="mb-4 text-2xl font-medium">{title}</h1>
        {children}
        <p className="mt-4 text-xs text-muted">No account is needed to shop or check out. An account saves your basket across devices.</p>
      </div>
      {footer}
    </div>
  );
}
