"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch, Checkbox } from "@/components/ui/switch";
import { Alert } from "@/components/ui/misc";
import { Field, FormSection, err } from "@/components/forms/field";
import { sessionSchema, type SessionFormValues } from "@/lib/validators/operations";
import { createSessions } from "./actions";
import type { z } from "zod";

type Opt = { id: string; name: string; branchId: string };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SessionForm({ defaults, branches, groups, venues, coaches }: { defaults: SessionFormValues; branches: { id: string; name: string }[]; groups: Opt[]; venues: Opt[]; coaches: Opt[] }) {
  const router = useRouter();
  const [conflicts, setConflicts] = React.useState<string[] | null>(null);
  const form = useForm<SessionFormValues, unknown, z.output<typeof sessionSchema>>({ resolver: zodResolver(sessionSchema) as unknown as Resolver<SessionFormValues, unknown, z.output<typeof sessionSchema>>, defaultValues: defaults });
  const { register, control, watch, setValue, formState: { errors, isSubmitting } } = form;
  const branchId = watch("branchId");
  const repeat = watch("repeat");

  const submit = (allowConflicts: boolean) =>
    form.handleSubmit(async (values) => {
      const res = await createSessions({ ...values, allowConflicts });
      if (res.ok) {
        toast.success(res.message);
        router.push(res.data && res.data.count === 1 ? `/sessions/${res.data.id}` : `/calendar?date=${values.date}&view=week`);
        router.refresh();
      } else if (res.fieldErrors?._conflicts) {
        setConflicts(res.fieldErrors._conflicts);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else toast.error(res.error);
    })();

  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); setConflicts(null); submit(false); }}>
        <CardContent className="flex flex-col gap-6 pt-6">
          {conflicts ? (
            <Alert tone="warning" title="Scheduling conflicts">
              <ul className="mt-1 list-disc pl-5">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
              <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setConflicts(null)}>Change details</Button><Button type="button" size="sm" onClick={() => submit(true)} disabled={isSubmitting}><AlertTriangle /> Schedule anyway</Button></div>
            </Alert>
          ) : null}
          <FormSection title="Session">
            <Field label="Title" required className="sm:col-span-2" error={err(errors, "title")}><Input {...register("title")} placeholder="Under-12 training" /></Field>
            <Field label="Branch" required error={err(errors, "branchId")}><NativeSelect {...register("branchId")} onChange={(e) => { setValue("branchId", e.target.value); setValue("ageGroupId", ""); setValue("venueId", ""); setValue("coachId", ""); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></Field>
            <Field label="Age group" error={err(errors, "ageGroupId")}><NativeSelect {...register("ageGroupId")} onChange={(e) => { setValue("ageGroupId", e.target.value); const g = groups.find((x) => x.id === e.target.value); if (g && !form.getValues("title")) setValue("title", `${g.name} training`); }}><option value="">None (mixed / open)</option>{groups.filter((g) => g.branchId === branchId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></Field>
            <Field label="Coach" error={err(errors, "coachId")}><NativeSelect {...register("coachId")}><option value="">Unassigned</option>{coaches.filter((c) => c.branchId === branchId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Venue" error={err(errors, "venueId")}><NativeSelect {...register("venueId")}><option value="">Unassigned</option>{venues.filter((v) => v.branchId === branchId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect></Field>
          </FormSection>
          <FormSection title="When">
            <Field label={repeat ? "First date" : "Date"} required error={err(errors, "date")}><Input type="date" {...register("date")} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start" required error={err(errors, "startTime")}><Input type="time" {...register("startTime")} /></Field>
              <Field label="Minutes" required error={err(errors, "durationMinutes")}><Input type="number" step={15} {...register("durationMinutes")} /></Field>
            </div>
            <Controller control={control} name="repeat" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2"><Switch checked={field.value} onCheckedChange={field.onChange} /> Repeat weekly</label>} />
            {repeat ? (
              <>
                <Field label="On" className="sm:col-span-2" error={err(errors, "weekdays")}>
                  <Controller control={control} name="weekdays" render={({ field }) => (
                    <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => (
                      <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                        <Checkbox checked={(field.value ?? []).map(Number).includes(i)} onChange={(e) => field.onChange(e.target.checked ? [...(field.value ?? []), i] : (field.value ?? []).filter((x) => Number(x) !== i))} />{d}
                      </label>
                    ))}</div>
                  )} />
                </Field>
                <Field label="Every" error={err(errors, "intervalWeeks")}><NativeSelect {...register("intervalWeeks")}><option value={1}>Every week</option><option value={2}>Every 2 weeks</option><option value={3}>Every 3 weeks</option><option value={4}>Every 4 weeks</option></NativeSelect></Field>
                <Field label="Until" required error={err(errors, "repeatUntil")} hint="Holidays are skipped automatically"><Input type="date" {...register("repeatUntil")} /></Field>
              </>
            ) : null}
          </FormSection>
          <FormSection title="Plan">
            <Field label="Capacity" error={err(errors, "capacity")} hint="Blank = no limit"><Input type="number" {...register("capacity")} /></Field>
            <Controller control={control} name="countsTowardCredits" render={({ field }) => <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Uses session credits</label>} />
            <Field label="Training objectives" className="sm:col-span-2" error={err(errors, "objectives")}><Textarea rows={3} {...register("objectives")} placeholder="e.g. Passing under pressure, 4v4 rondos, finishing" /></Field>
            <Field label="Notes" className="sm:col-span-2" error={err(errors, "notes")}><Textarea rows={2} {...register("notes")} /></Field>
          </FormSection>
        </CardContent>
        <div className="sticky bottom-16 flex justify-end gap-2 rounded-b-lg border-t bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-0">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button disabled={isSubmitting}>{isSubmitting ? "Checking…" : "Schedule"}</Button>
        </div>
      </form>
    </Card>
  );
}
