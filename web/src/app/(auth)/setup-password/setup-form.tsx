"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { setupPasswordAction } from "../actions";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setupPasswordAction, undefined);
  if (state?.ok) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <Alert tone="success" title="Password saved">You can now sign in.</Alert>
        <Button asChild size="lg"><Link href="/login">Go to sign in</Link></Button>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <Button type="submit" size="lg" disabled={pending}>Save password</Button>
    </form>
  );
}
