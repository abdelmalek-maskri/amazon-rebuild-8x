import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { ButtonLink } from "@/components/ui/button";
import { safeNext } from "@/lib/next-path";
import { getServerUser } from "@/lib/server-session";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const next = safeNext((await searchParams).next);
  if (await getServerUser()) redirect(next);

  return (
    <AuthCard
      title="Sign in"
      footer={
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-xs text-muted">New to {SITE_NAME.toLowerCase()}?</p>
          <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} variant="secondary" fullWidth>
            Create your account
          </ButtonLink>
        </div>
      }
    >
      <AuthForm mode="signin" next={next} />
    </AuthCard>
  );
}
