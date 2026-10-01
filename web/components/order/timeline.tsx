import type { Order } from "@/lib/api";
import { cn } from "@/lib/cn";

// Fixed to UTC and labelled: the server renders this, and a local time would differ per visitor.
const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

// A vertical track like a parcel tracker. Future steps are hollow and say "expected".
export function Timeline({ steps }: { steps: Order["steps"] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden className={cn("absolute top-5 left-[9px] h-full w-0.5", steps[i + 1]?.done ? "bg-success" : "bg-border")} />
          )}
          <span
            aria-hidden
            className={cn("relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", s.done ? "border-success bg-success text-surface" : "border-border bg-surface")}
          >
            {s.done && <span className="text-[10px] leading-none">✓</span>}
          </span>
          <div>
            <p className={cn("text-sm font-bold", !s.done && "text-muted")}>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
            </p>
            {s.at && (
              <p className="text-xs text-muted">
                {s.done ? "" : "Expected "}
                {when.format(new Date(s.at))} UTC
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
