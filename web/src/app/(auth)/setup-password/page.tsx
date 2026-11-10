import type { Metadata } from "next";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetupPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Set your password</h1>
      <p className="mt-1 text-sm text-muted">Choose a password with at least 10 characters, including letters and numbers.</p>
      {token ? <SetupForm token={token} /> : <p className="mt-6 text-sm text-danger">This link is incomplete. Open the full link from your invitation.</p>}
    </div>
  );
}
