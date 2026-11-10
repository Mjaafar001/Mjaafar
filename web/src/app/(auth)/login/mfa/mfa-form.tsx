"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { verifyMfaAction, logoutAction } from "../../actions";

export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfaAction, undefined);
  return (
    <>
      <form action={action} className="mt-8 flex flex-col gap-4">
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="h-14 text-center font-display text-3xl tracking-[0.4em]" aria-label="Authentication code" />
        <Button type="submit" size="lg" disabled={pending}>Verify</Button>
      </form>
      <form action={logoutAction} className="mt-4 text-center">
        <button className="text-sm text-muted hover:underline">Use a different account</button>
      </form>
    </>
  );
}
