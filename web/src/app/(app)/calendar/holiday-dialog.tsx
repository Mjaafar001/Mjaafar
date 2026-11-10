"use client";
import * as React from "react";
import { Controller } from "react-hook-form";
import { Palmtree } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { holidaySchema } from "@/lib/validators/operations";
import { addHoliday } from "../sessions/actions";

export function HolidayDialog({ branches, allBranches }: { branches: { value: string; label: string }[]; allBranches: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: holidaySchema, action: addHoliday, defaultValues: { branchId: allBranches ? "" : branches[0]?.value ?? "", date: "", name: "", cancelSessions: true }, onSuccess: () => { setOpen(false); form.reset(); } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Palmtree /> Holiday</Button></DialogTrigger>
      <DialogContent title="Add holiday / closure" description="Recurring schedules skip holidays. Existing sessions that day can be cancelled automatically (credits are returned).">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Name" required error={err(errors, "name")}><Input {...form.register("name")} placeholder="Independence Day" /></Field>
          <Field label="Date" required error={err(errors, "date")}><Input type="date" {...form.register("date")} /></Field>
          <Field label="Branch"><NativeSelect {...form.register("branchId")}>{allBranches ? <option value="">All branches</option> : null}{branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</NativeSelect></Field>
          <Controller control={form.control} name="cancelSessions" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Cancel sessions already scheduled that day</label>} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Add holiday</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
