import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/next-path";
import { getServerUser } from "@/lib/server-session";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next);
  if (await getServerUser()) redirect(next);

  return (
    <AuthCard
      title="Create account"
      footer={
        <p className="text-sm">
          Already have an account?{" "}
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="text-link hover:text-link-hover hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <AuthForm mode="signup" next={next} />
    </AuthCard>
  );
}
