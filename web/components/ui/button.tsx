import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "buy" | "secondary";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "border-cta-border bg-cta hover:bg-cta-hover",
  buy: "border-buy-border bg-buy hover:bg-buy-hover",
  secondary: "border-border bg-surface hover:bg-page",
};

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; fullWidth?: boolean; loading?: boolean };

export function Button({ variant = "primary", fullWidth, loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], fullWidth && "w-full", className)}
      {...props}
    >
      {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; fullWidth?: boolean };

// Same look for navigation, so a link styled as a button is still a real link (middle click, new tab).
export function ButtonLink({ variant = "primary", fullWidth, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(base, variants[variant], fullWidth && "w-full", className)} {...props} />;
}
