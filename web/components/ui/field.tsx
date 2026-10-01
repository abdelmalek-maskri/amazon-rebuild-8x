import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm shadow-[0_1px_2px_rgba(15,17,17,0.15)_inset] " +
  "placeholder:text-muted aria-invalid:border-danger";

type FieldProps = { label: string; name: string; error?: string; hint?: string };

// Label, hint and error wired to the control by id, so screen readers announce all three.
function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function described(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function Input({ label, name, error, hint, id = name, className, ...props }: FieldProps & ComponentProps<"input">) {
  return (
    <Field label={label} id={id} error={error} hint={hint}>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, error, hint)}
        className={cn(control, className)}
        {...props}
      />
    </Field>
  );
}

export function Select({ label, name, error, hint, id = name, className, children, ...props }: FieldProps & ComponentProps<"select">) {
  return (
    <Field label={label} id={id} error={error} hint={hint}>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, error, hint)}
        className={cn(control, "cursor-pointer bg-page", className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode; count?: number };

// Filter rows show how many results each option gives, which Amazon's filters never do.
export function Checkbox({ label, count, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-8", className)}>
      <input type="checkbox" className="size-4 cursor-pointer accent-link" {...props} />
      <span>{label}</span>
      {count !== undefined && <span className="text-muted">({count})</span>}
    </label>
  );
}
