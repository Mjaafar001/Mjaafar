"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Camera, Eye, Lock, Plus, Repeat, Trophy, Upload, UserPlus } from "lucide-react";
import type { z } from "zod";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, DescriptionList, Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { achievementSchema, creditAdjustSchema, linkGuardianSchema, medicalSchema, transferSchema } from "@/lib/validators/player";
import { addAchievement, adjustCredits, linkGuardian, revealMedical, transferPlayer, updateMedical, uploadPlayerFile } from "../actions";

export function PhotoUpload({ playerId, name, hasPhoto, color, canEdit }: { playerId: string; name: string; hasPhoto: boolean; color?: string; canEdit: boolean }) {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState(0);
  return (
    <div className="relative w-fit">
      <Avatar name={name} src={hasPhoto ? `/api/players/${playerId}/photo?v=${v}` : null} size={96} color={color} className="border-4 border-surface shadow-md" />
      {canEdit ? (
        <>
          <button type="button" disabled={pending} onClick={() => ref.current?.click()} className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border-2 border-surface bg-primary text-white shadow" aria-label="Change photo">
            <Camera className="size-4" />
          </button>
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("playerId", playerId); fd.set("kind", "photo"); fd.set("file", f);
            start(async () => { const r = await uploadPlayerFile(fd); if (r.ok) { toast.success(r.message); setV(Date.now()); router.refresh(); } else toast.error(r.error); });
          }} />
        </>
      ) : null}
    </div>
  );
}

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Aunt", "Uncle", "Sibling", "Other"];

export function GuardianDialog({ playerId }: { playerId: string }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: linkGuardianSchema, action: linkGuardian,
    defaultValues: { playerId, firstName: "", lastName: "", relationship: "Mother", phone: "", whatsapp: "", email: "", address: "", occupation: "", isPrimary: false, receivesBilling: true },
    onSuccess: () => { setOpen(false); form.reset(); },
  });
  const { register, control } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> Add guardian</Button></DialogTrigger>
      <DialogContent title="Add parent / guardian" description="If this person is already a guardian of another player (same phone or email), the existing record is linked — siblings share one parent account.">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="First name" required error={err(errors, "firstName")}><Input {...register("firstName")} /></Field>
          <Field label="Last name" required error={err(errors, "lastName")}><Input {...register("lastName")} /></Field>
          <Field label="Relationship" required error={err(errors, "relationship")}><NativeSelect {...register("relationship")}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</NativeSelect></Field>
          <Field label="Phone" required error={err(errors, "phone")}><Input type="tel" {...register("phone")} /></Field>
          <Field label="WhatsApp" error={err(errors, "whatsapp")}><Input type="tel" {...register("whatsapp")} /></Field>
          <Field label="Email" error={err(errors, "email")}><Input type="email" {...register("email")} /></Field>
          <Controller control={control} name="isPrimary" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Primary contact</label>} />
          <Controller control={control} name="receivesBilling" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Receives invoices</label>} />
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Link guardian</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Medical = z.input<typeof medicalSchema>;

export function MedicalPanel({ playerId, canEdit, clearance }: { playerId: string; canEdit: boolean; clearance: string }) {
  const [data, setData] = React.useState<Medical | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();
  const reveal = () => start(async () => { const r = await revealMedical(playerId); if (r.ok && r.data) setData({ playerId, ...r.data } as Medical); else if (!r.ok) toast.error(r.error); });

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock className="size-8 text-muted" />
          <div><p className="font-semibold">Medical information is protected</p><p className="text-sm text-muted">Clearance: <StatusBadge status={clearance} /> · Viewing is recorded in the audit log.</p></div>
          <Button onClick={reveal} disabled={pending}><Eye /> Show medical information</Button>
        </CardContent>
      </Card>
    );
  }
  if (editing) return <MedicalForm defaults={data} onDone={(d) => { setEditing(false); if (d) setData(d); }} />;
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Medical & safety</CardTitle><CardDescription>Encrypted at rest. Share only with people who need it.</CardDescription></div>
        {canEdit ? <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
      </CardHeader>
      <CardContent>
        {data.allergies ? <Alert tone="danger" title="Allergies" className="mb-4">{data.allergies}</Alert> : null}
        <DescriptionList items={[
          { label: "Medical conditions", value: data.conditions || "None recorded" },
          { label: "Medications", value: data.medications || "None recorded" },
          { label: "Emergency instructions", value: data.emergencyInstructions || "—" },
          { label: "Blood group", value: data.bloodGroup || "—" },
          { label: "Doctor", value: [data.doctorName, data.doctorPhone].filter(Boolean).join(" · ") || "—" },
          { label: "Clearance", value: <span><StatusBadge status={data.clearanceStatus} />{data.clearanceExpiresAt ? ` until ${data.clearanceExpiresAt}` : ""}</span> },
        ]} />
      </CardContent>
    </Card>
  );
}

function MedicalForm({ defaults, onDone }: { defaults: Medical; onDone: (d?: Medical) => void }) {
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: medicalSchema, action: updateMedical, defaultValues: defaults, onSuccess: () => onDone(form.getValues()) });
  const { register } = form;
  return (
    <Card>
      <CardHeader><CardTitle>Edit medical information</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Allergies" error={err(errors, "allergies")}><Textarea rows={2} {...register("allergies")} /></Field>
          <Field label="Medical conditions" error={err(errors, "conditions")}><Textarea rows={2} {...register("conditions")} /></Field>
          <Field label="Medications" error={err(errors, "medications")}><Textarea rows={2} {...register("medications")} /></Field>
          <Field label="Emergency instructions" error={err(errors, "emergencyInstructions")}><Textarea rows={2} {...register("emergencyInstructions")} /></Field>
          <Field label="Blood group" error={err(errors, "bloodGroup")}><Input {...register("bloodGroup")} /></Field>
          <Field label="Doctor's name" error={err(errors, "doctorName")}><Input {...register("doctorName")} /></Field>
          <Field label="Doctor's phone" error={err(errors, "doctorPhone")}><Input {...register("doctorPhone")} /></Field>
          <Field label="Clearance status" error={err(errors, "clearanceStatus")}>
            <NativeSelect {...register("clearanceStatus")}><option value="PENDING">Pending</option><option value="CLEARED">Cleared</option><option value="NOT_CLEARED">Not cleared</option><option value="EXPIRED">Expired</option></NativeSelect>
          </Field>
          <Field label="Clearance expires" error={err(errors, "clearanceExpiresAt")}><Input type="date" {...register("clearanceExpiresAt")} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => onDone()}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CreditDialog({ playerId }: { playerId: string }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: creditAdjustSchema, action: adjustCredits,
    defaultValues: { playerId, delta: 1, type: "MANUAL_ADJUSTMENT", reason: "" },
    onSuccess: () => { setOpen(false); form.reset(); },
  });
  const { register } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Adjust credits</Button></DialogTrigger>
      <DialogContent title="Adjust session credits" description="Use a negative number to remove credits. The reason is recorded permanently.">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Change" required error={err(errors, "delta")}><Input type="number" {...register("delta")} /></Field>
          <Field label="Type" error={err(errors, "type")}><NativeSelect {...register("type")}><option value="MANUAL_ADJUSTMENT">Adjustment</option><option value="MAKEUP_GRANT">Makeup session</option></NativeSelect></Field>
          <Field label="Reason" required className="col-span-2" error={err(errors, "reason")}><Textarea rows={2} {...register("reason")} placeholder="e.g. Session missed due to pitch closure" /></Field>
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DOC_TYPES = [["BIRTH_CERTIFICATE", "Birth certificate"], ["CONSENT_FORM", "Consent form"], ["MEDICAL_CLEARANCE", "Medical clearance"], ["REGISTRATION_FORM", "Registration form"], ["PLAYER_AGREEMENT", "Player agreement"], ["CERTIFICATE", "Certificate"], ["OTHER", "Other"]] as const;

export function DocumentUpload({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardContent className="pt-5">
        <form ref={ref} action={(fd) => start(async () => { fd.set("playerId", playerId); fd.set("kind", "document"); const r = await uploadPlayerFile(fd); if (r.ok) { toast.success(r.message); ref.current?.reset(); router.refresh(); } else toast.error(r.error); })} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_160px_1fr_auto]">
          <Field label="File (PDF or image, max 5 MB)"><Input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="py-1.5" /></Field>
          <Field label="Type"><NativeSelect name="type">{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
          <Field label="Expires"><Input type="date" name="expiresAt" /></Field>
          <Field label="Title"><Input name="title" placeholder="Optional" maxLength={120} /></Field>
          <Button disabled={pending}><Upload /> Upload</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AchievementDialog({ playerId }: { playerId: string }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: achievementSchema, action: addAchievement,
    defaultValues: { playerId, title: "", description: "", awardedOn: new Date().toISOString().slice(0, 10) },
    onSuccess: () => { setOpen(false); form.reset(); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Trophy /> Add achievement</Button></DialogTrigger>
      <DialogContent title="Add achievement">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Title" required error={err(errors, "title")}><Input {...form.register("title")} placeholder="Player of the Month" /></Field>
          <Field label="Date" required error={err(errors, "awardedOn")}><Input type="date" {...form.register("awardedOn")} /></Field>
          <Field label="Description" error={err(errors, "description")}><Textarea rows={2} {...form.register("description")} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({ playerId, branches, current }: { playerId: string; branches: { id: string; name: string; groups: { id: string; name: string }[] }[]; current: { branchId: string; ageGroupId: string } }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: transferSchema, action: transferPlayer,
    defaultValues: { playerId, toBranchId: current.branchId, toAgeGroupId: current.ageGroupId, reason: "" },
    onSuccess: () => setOpen(false),
  });
  const branch = branches.find((b) => b.id === form.watch("toBranchId"));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Repeat /> Move</Button></DialogTrigger>
      <DialogContent title="Move player" description="Change age group or branch. Attendance, credits and payments stay with the player; the move is recorded in their history.">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Branch" error={err(errors, "toBranchId")}><NativeSelect {...form.register("toBranchId")} onChange={(e) => { form.setValue("toBranchId", e.target.value); form.setValue("toAgeGroupId", ""); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></Field>
          <Field label="Age group" error={err(errors, "toAgeGroupId")}><NativeSelect {...form.register("toAgeGroupId")}><option value="">Unassigned</option>{branch?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></Field>
          <Field label="Reason" required error={err(errors, "reason")}><Textarea rows={2} {...form.register("reason")} placeholder="e.g. Moved up after assessment" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Move player</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
