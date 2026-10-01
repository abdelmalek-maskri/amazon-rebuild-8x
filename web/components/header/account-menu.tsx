"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ApiError, signOut, type User } from "@/lib/api";

const box = "flex shrink-0 flex-col rounded px-2 py-1 text-left leading-tight hover:ring-1 hover:ring-surface";

// Signed out: a link to sign in that brings the shopper back here afterwards.
// Signed in: Amazon's "Hello, Ada / Account & Lists" button with a small menu.
export function AccountMenu({ user }: { user: User | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const here = pathname + (params.size ? `?${params}` : "");

  if (!user) {
    return (
      <Link href={`/signin?next=${encodeURIComponent(here)}`} className={box}>
        <span className="text-xs">Hello, sign in</span>
        <span className="text-sm font-bold">Account &amp; Lists</span>
      </Link>
    );
  }
  return <SignedInMenu user={user} />;
}

function SignedInMenu({ user }: { user: User }) {
  const router = useRouter();
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Close on a click outside or Escape, like any menu.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function doSignOut() {
    setError("");
    try {
      await signOut();
      setOpen(false);
      // Back to the home page as a guest; refresh re-renders the header and an empty basket.
      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} className={box}>
        <span className="max-w-32 truncate text-xs">Hello, {user.name}</span>
        <span className="text-sm font-bold">
          Account &amp; Lists <span aria-hidden>▾</span>
        </span>
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-surface p-2 text-sm text-ink shadow-xl"
      >
        <p className="truncate px-2 py-1 text-xs text-muted">Signed in as {user.email}</p>
        <Link href="/orders" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded px-2 hover:bg-page">
          Your Orders
        </Link>
        <Link href="/wishlist" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded px-2 hover:bg-page">
          Your Wish List
        </Link>
        <button
          type="button"
          onClick={doSignOut}
          disabled={pending}
          className="flex min-h-11 w-full items-center rounded px-2 text-left hover:bg-page disabled:opacity-60"
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
        {error && (
          <p role="alert" className="px-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
