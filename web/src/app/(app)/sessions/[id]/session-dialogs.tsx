"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarClock, Pencil, UserPlus } from "lucide-react";
import { z } from "zod";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/misc";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { cancelSessionSchema, extraPlayerSchema, rescheduleSchema } from "@/lib/validators/operations";
import { addExtraPlayer, cancelSession, rescheduleSession, updateSessionDetails } from "../actions";

export function CancelDialog({ sessionId, recurring, hasAttendance }: { sessionId: string; recurring: boolean; hasAttendance: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: cancelSessionSchema, action: cancelSession, defaultValues: { sessionId, type: "WEATHER", reason: "", scope: "THIS" }, onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="text-danger"><Ban /> Cancel</Button></DialogTrigger>
      <DialogContent title="Cancel session" description={hasAttendance ? "Attendance has been taken. Any session credits used will be returned to players." : "Players won't lose session credits for cancelled sessions."}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Reason type" error={err(errors, "type")}><NativeSelect {...form.register("type")}><option value="WEATHER">Weather</option><option value="HOLIDAY">Holiday</option><option value="VENUE">Venue unavailable</option><option value="COACH_UNAVAILABLE">Coach unavailable</option><option value="OTHER">Other</option></NativeSelect></Field>
          <Field label="Message" required error={err(errors, "reason")}><Textarea rows={2} {...form.register("reason")} placeholder="Heavy rain — pitch waterlogged" /></Field>
          {recurring ? <Field label="Apply to"><NativeSelect {...form.register("scope")}><option value="THIS">This session only</option><option value="FOLLOWING">This and all following sessions in the series</option></NativeSelect></Field> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep session</Button><Button variant="destructive" disabled={submitting}>Cancel session</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleDialog({ sessionId, defaults, coaches, venues }: { sessionId: string; defaults: { date: string; startTime: string; durationMinutes: number; venueId: string; coachId: string }; coaches: { value: string; label: string }[]; venues: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<string[] | null>(null);
  const { form, errors, submitting } = useActionForm({ schema: rescheduleSchema, action: rescheduleSession, defaultValues: { sessionId, ...defaults, allowConflicts: false } });
  const submit = (allowConflicts: boolean) => form.handleSubmit(async (v) => {
    const r = await rescheduleSession({ ...v, allowConflicts });
    if (r.ok) { toast.success(r.message); setOpen(false); setConflicts(null); router.refresh(); }
    else if (r.fieldErrors?._conflicts) setConflicts(r.fieldErrors._conflicts);
    else toast.error(r.error);
  })();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><CalendarClock /> Reschedule</Button></DialogTrigger>
      <DialogContent title="Reschedule session">
        <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="grid grid-cols-2 gap-4">
          {conflicts ? <Alert tone="warning" title="Conflicts" className="col-span-2"><ul className="list-disc pl-4">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul><Button type="button" size="sm" className="mt-2" onClick={() => submit(true)}><AlertTriangle /> Reschedule anyway</Button></Alert> : null}
          <Field label="Date" error={err(errors, "date")}><Input type="date" {...form.register("date")} /></Field>
          <Field label="Start" error={err(errors, "startTime")}><Input type="time" {...form.register("startTime")} /></Field>
          <Field label="Minutes" error={err(errors, "durationMinutes")}><Input type="number" step={15} {...form.register("durationMinutes")} /></Field>
          <Field label="Venue"><NativeSelect {...form.register("venueId")}><option value="">Unassigned</option>{venues.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</NativeSelect></Field>
          <Field label="Coach" className="col-span-2"><NativeSelect {...form.register("coachId")}><option value="">Unassigned</option>{coaches.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect></Field>
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Reschedule</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({ sessionId: z.string(), title: z.string().trim().min(1, "Title is required").max(120), objectives: z.string().max(2000).optional(), notes: z.string().max(2000).optional(), capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(500)]).optional(), countsTowardCredits: z.boolean() });

export function EditDialog({ session }: { session: z.input<typeof editSchema> }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: editSchema, action: updateSessionDetails, defaultValues: session, onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Pencil /> Edit</Button></DialogTrigger>
      <DialogContent title="Edit session" wide>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Title" error={err(errors, "title")}><Input {...form.register("title")} /></Field>
          <Field label="Training objectives" error={err(errors, "objectives")}><Textarea rows={4} {...form.register("objectives")} /></Field>
          <Field label="Notes" error={err(errors, "notes")}><Textarea rows={2} {...form.register("notes")} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Capacity" error={err(errors, "capacity")}><Input type="number" {...form.register("capacity")} /></Field>
            <Controller control={form.control} name="countsTowardCredits" render={({ field }) => <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Uses session credits</label>} />
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddPlayerDialog({ sessionId, players }: { sessionId: string; players: { id: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: extraPlayerSchema, action: addExtraPlayer, defaultValues: { sessionId, playerId: "", reason: "MAKEUP" }, onSuccess: () => { setOpen(false); form.reset(); } });
  const list = players.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><UserPlus /> Add player</Button></DialogTrigger>
      <DialogContent title="Add player to this session" description="For approved makeup sessions, trials or guests from other groups.">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
          <Field label="Player" error={err(errors, "playerId")}><NativeSelect {...form.register("playerId")} size={6} className="h-40"><option value="">Choose…</option>{list.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</NativeSelect></Field>
          <Field label="Reason"><NativeSelect {...form.register("reason")}><option value="MAKEUP">Makeup session</option><option value="TRIAL">Trial</option><option value="GUEST">Guest</option></NativeSelect></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
