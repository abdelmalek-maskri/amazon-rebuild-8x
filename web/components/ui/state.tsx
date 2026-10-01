import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StateProps = { title: string; message?: string; action?: ReactNode; className?: string };

function State({ title, message, action, tone, className }: StateProps & { tone: "empty" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-12 text-center", className)}
    >
      <h2 className={cn("text-lg font-bold", tone === "error" && "text-danger")}>{title}</h2>
      {message && <p className="max-w-md text-sm text-muted">{message}</p>}
      {action}
    </div>
  );
}

// Every list or page that can be empty says so plainly and offers the next step.
export function EmptyState(props: StateProps) {
  return <State tone="empty" {...props} />;
}

export function ErrorState(props: StateProps) {
  return <State tone="error" {...props} />;
}
