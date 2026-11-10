import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mfaPending) redirect("/");
  return (
    <div>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Verify it&apos;s you</h1>
      <p className="mt-1 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
      <MfaForm />
    </div>
  );
}
