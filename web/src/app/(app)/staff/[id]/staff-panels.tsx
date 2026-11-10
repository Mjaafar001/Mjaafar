"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { certificationSchema } from "@/lib/validators/operations";
import { addCertification, saveAvailability } from "../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CertificationDialog({ staffId }: { staffId: string }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: certificationSchema, action: addCertification, defaultValues: { staffId, name: "", issuer: "", issuedAt: "", expiresAt: "" }, onSuccess: () => { setOpen(false); form.reset(); } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus /> Add</Button></DialogTrigger>
      <DialogContent title="Add certification">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Certification" required className="col-span-2" error={err(errors, "name")}><Input {...form.register("name")} placeholder="CAF C Licence" /></Field>
          <Field label="Issued by" className="col-span-2" error={err(errors, "issuer")}><Input {...form.register("issuer")} /></Field>
          <Field label="Issued" error={err(errors, "issuedAt")}><Input type="date" {...form.register("issuedAt")} /></Field>
          <Field label="Expires" error={err(errors, "expiresAt")}><Input type="date" {...form.register("expiresAt")} /></Field>
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AvailabilityEditor({ staffId, initial }: { staffId: string; initial: { weekday: number; startTime: string; endTime: string }[] }) {
  const router = useRouter();
  const [slots, setSlots] = React.useState(initial);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-col gap-2">
      {slots.length === 0 ? <p className="text-sm text-muted">No regular schedule set.</p> : null}
      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <NativeSelect className="w-28" value={s.weekday} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} aria-label="Day">{DAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}</NativeSelect>
          <Input type="time" className="w-32" value={s.startTime} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} aria-label="Start" />
          <span className="text-muted">to</span>
          <Input type="time" className="w-32" value={s.endTime} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} aria-label="End" />
          <Button variant="ghost" size="icon" onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label="Remove slot"><Trash2 /></Button>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setSlots([...slots, { weekday: 1, startTime: "15:00", endTime: "18:00" }])}><Plus /> Add slot</Button>
        <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveAvailability({ staffId, slots }); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error); })}>Save schedule</Button>
      </div>
    </div>
  );
}
