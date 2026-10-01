"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ApiError, signIn, signUp } from "@/lib/api";

type Mode = "signin" | "signup";

// One form for both pages. Field errors from the API land under their field; anything else
// (wrong password, too many attempts) goes in the alert at the top.
export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; signInInstead?: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, startRedirect] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      if (mode === "signup") await signUp(String(data.get("name") ?? ""), email, password);
      else await signIn(email, password);
      // Back to where the shopper was; refresh so the header and basket re-render signed in.
      startRedirect(() => {
        router.replace(next);
        router.refresh();
      });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.fields.length) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      } else {
        setFormError({ message: err.message, signInInstead: err.code === "EMAIL_TAKEN" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || redirecting;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <div role="alert" className="rounded-lg border border-danger bg-danger/5 p-3 text-sm">
          <p className="font-bold text-danger">There was a problem</p>
          <p>{formError.message}</p>
          {formError.signInInstead && (
            <Link href={`/signin?next=${encodeURIComponent(next)}`} className="text-link hover:text-link-hover hover:underline">
              Sign in instead
            </Link>
          )}
        </div>
      )}
      {mode === "signup" && <Input label="Your name" name="name" autoComplete="name" maxLength={50} required error={fieldErrors.name} />}
      <Input label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={fieldErrors.email} />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        minLength={mode === "signup" ? 8 : undefined}
        maxLength={128}
        hint={mode === "signup" ? "At least 8 characters." : undefined}
        error={fieldErrors.password}
      />
      <Button type="submit" fullWidth loading={busy}>
        {mode === "signup" ? "Create your account" : "Sign in"}
      </Button>
    </form>
  );
}
