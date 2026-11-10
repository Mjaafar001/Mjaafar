import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user && !user.mfaPending) redirect("/");
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Staff, coaches and parents use the same sign-in.</p>
      <LoginForm next={next} />
      <p className="mt-8 text-center text-sm text-muted">
        New family?{" "}
        <Link href="/apply" className="font-semibold text-primary hover:underline">
          Apply for a place
        </Link>
      </p>
    </div>
  );
}
