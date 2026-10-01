"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; title: string; action?: { label: string; href: string } };

const ToastContext = createContext<((toast: Omit<Toast, "id">) => void) | null>(null);

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++nextId.current;
    // Keep at most three on screen; a burst of clicks shouldn't bury the page.
    setToasts((all) => [...all.slice(-2), { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Always mounted so screen readers are listening before the first toast arrives. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Hovering or focusing pauses the timer, so nobody loses a toast while reaching for its link.
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg bg-nav-light px-4 py-3 text-sm text-surface shadow-lg"
    >
      <span className="flex-1">{toast.title}</span>
      {toast.action && (
        <Link href={toast.action.href} className="font-bold text-cta underline-offset-2 hover:underline">
          {toast.action.label}
        </Link>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-2 grid size-11 place-items-center rounded-full text-lg leading-none hover:bg-surface/10"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
