"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { changePassword, confirmMfaEnrollment, disableMfa, startMfaEnrollment } from "./actions";

export function MfaPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [enroll, setEnroll] = React.useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, start] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">Two-factor authentication {enabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}</CardTitle>
          <CardDescription>Use an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) for a 6-digit code at sign-in.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {enabled ? (
          required ? (
            <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="size-4 text-success" /> Required for your role.</p>
          ) : (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await disableMfa({ password }); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error); }); }}>
              <div className="flex flex-col gap-1.5"><Label htmlFor="mfa-pw">Confirm password to turn off</Label><Input id="mfa-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-64" /></div>
              <Button variant="outline" disabled={pending || !password}>Turn off</Button>
            </form>
          )
        ) : enroll ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR code for authenticator app" className="size-44 rounded-lg border bg-white p-2" />
            <form className="flex flex-1 flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await confirmMfaEnrollment({ code }); if (r.ok) { toast.success(r.message); setEnroll(null); router.refresh(); } else toast.error(r.error); }); }}>
              <p className="text-sm">1. Scan the QR code with your authenticator app.<br />2. Enter the 6-digit code it shows.</p>
              <p className="text-xs text-muted">Can&apos;t scan? Enter this key manually: <code className="break-all rounded bg-surface-2 px-1">{enroll.secret}</code></p>
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={7} placeholder="123456" className="w-40 font-display text-xl tracking-widest" aria-label="Verification code" />
              <Button className="w-fit" disabled={pending || code.length < 6}>Verify and turn on</Button>
            </form>
          </div>
        ) : (
          <Button onClick={() => start(async () => { const r = await startMfaEnrollment(); if (r.ok && r.data) setEnroll(r.data); })} disabled={pending}>
            <ShieldCheck /> Set up two-factor authentication
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PasswordPanel() {
  const [form, setForm] = React.useState({ current: "", next: "", confirm: "" });
  const [pending, start] = React.useTransition();
  return (
    <Card>
      <CardHeader><div><CardTitle>Password</CardTitle><CardDescription>At least 10 characters with letters and numbers.</CardDescription></div></CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await changePassword(form); if (r.ok) { toast.success(r.message); setForm({ current: "", next: "", confirm: "" }); } else toast.error(r.error); }); }}>
          {(["current", "next", "confirm"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <Label htmlFor={`pw-${k}`}>{k === "current" ? "Current password" : k === "next" ? "New password" : "Confirm new password"}</Label>
              <Input id={`pw-${k}`} type="password" autoComplete={k === "current" ? "current-password" : "new-password"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-3"><Button disabled={pending || !form.current || !form.next}>Change password</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
