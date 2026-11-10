"use client";
import * as React from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { Copy, KeyRound, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/misc";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { userSchema } from "@/lib/validators/operations";
import { issuePasswordLink, saveUser } from "../actions";

function LinkBox({ link }: { link: string }) {
  return (
    <Alert tone="success" title="One-time sign-in link created">
      <p className="mb-2">Share this privately with the user (valid for a limited time). Email delivery is configured in Phase 4.</p>
      <div className="flex gap-2">
        <Input readOnly value={link} className="text-xs" onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" size="icon" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}><Copy /></Button>
      </div>
    </Alert>
  );
}

export function UserDialog({ user, roles, branches, allowAllBranches }: { user?: z.input<typeof userSchema>; roles: { value: string; label: string }[]; branches: { value: string; label: string }[]; allowAllBranches: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: userSchema, action: saveUser,
    defaultValues: user ?? { name: "", email: "", phone: "", isActive: true, roles: [{ roleId: "", branchId: allowAllBranches ? "" : (branches[0]?.value ?? "") }] },
    onSuccess: (res) => { const l = (res.data as { link?: string } | undefined)?.link; if (l) setLink(l); else setOpen(false); },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "roles" });
  const { register } = form;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setLink(null); if (!user) form.reset(); } }}>
      <DialogTrigger asChild>{user ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button><UserPlus /> New user</Button>}</DialogTrigger>
      <DialogContent title={user ? `Edit ${user.name}` : "New user"} description="Roles grant permissions. A branch-limited role only gives access to that branch's data." wide>
        {link ? <LinkBox link={link} /> : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={err(errors, "name")}><Input {...register("name")} /></Field>
            <Field label="Email" required error={err(errors, "email")}><Input type="email" {...register("email")} /></Field>
            <Field label="Phone" error={err(errors, "phone")}><Input {...register("phone")} /></Field>
            <Controller control={form.control} name="isActive" render={({ field }) => <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active (deactivating signs the user out everywhere)</label>} />
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Roles</span><Button type="button" variant="ghost" size="sm" onClick={() => append({ roleId: "", branchId: "" })}><Plus /> Add role</Button></div>
              <div className="flex flex-col gap-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2">
                    <NativeSelect {...register(`roles.${i}.roleId`)} aria-label="Role"><option value="">Choose role…</option>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</NativeSelect>
                    <NativeSelect {...register(`roles.${i}.branchId`)} aria-label="Branch">{allowAllBranches ? <option value="">All branches</option> : null}{branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</NativeSelect>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Remove role"><Trash2 /></Button>
                  </div>
                ))}
              </div>
              {err(errors, "roles") ? <p className="mt-1 text-xs text-danger">{err(errors, "roles")}</p> : null}
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>{user ? "Save" : "Create user"}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PasswordLinkButton({ userId }: { userId: string }) {
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await issuePasswordLink(userId); if (r.ok && r.data) setLink(r.data.link); else if (!r.ok) toast.error(r.error); })}><KeyRound /> Reset link</Button>
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent title="Password reset link">{link ? <LinkBox link={link} /> : null}</DialogContent>
      </Dialog>
    </>
  );
}
