"use client";
import * as React from "react";
import { Controller } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { seasonSchema, venueSchema } from "@/lib/validators/operations";
import { saveSeason, saveVenue } from "../actions";

export function VenueDialog({ venue, branches }: { venue?: z.input<typeof venueSchema>; branches: { value: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: venueSchema, action: saveVenue,
    defaultValues: venue ?? { branchId: branches[0]?.value ?? "", name: "", address: "", surface: "", capacity: "", isActive: true },
    onSuccess: () => { setOpen(false); if (!venue) form.reset(); },
  });
  const { register } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{venue ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button size="sm"><Plus /> Add venue</Button>}</DialogTrigger>
      <DialogContent title={venue ? "Edit venue" : "New venue"}>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Branch" required className="col-span-2" error={err(errors, "branchId")}><NativeSelect {...register("branchId")}>{branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</NativeSelect></Field>
          <Field label="Name" required className="col-span-2" error={err(errors, "name")}><Input {...register("name")} /></Field>
          <Field label="Address" className="col-span-2" error={err(errors, "address")}><Input {...register("address")} /></Field>
          <Field label="Surface" error={err(errors, "surface")}><Input {...register("surface")} placeholder="Artificial turf" /></Field>
          <Field label="Capacity" error={err(errors, "capacity")}><Input type="number" {...register("capacity")} /></Field>
          <Controller control={form.control} name="isActive" render={({ field }) => <label className="col-span-2 flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>} />
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SeasonDialog({ season }: { season?: z.input<typeof seasonSchema> }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: seasonSchema, action: saveSeason,
    defaultValues: season ?? { name: "", startDate: "", endDate: "", isCurrent: false },
    onSuccess: () => { setOpen(false); if (!season) form.reset(); },
  });
  const { register } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{season ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button size="sm"><Plus /> Add season</Button>}</DialogTrigger>
      <DialogContent title={season ? "Edit season" : "New season"}>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Name" required className="col-span-2" error={err(errors, "name")}><Input {...register("name")} placeholder="2026/27" /></Field>
          <Field label="Starts" required error={err(errors, "startDate")}><Input type="date" {...register("startDate")} /></Field>
          <Field label="Ends" required error={err(errors, "endDate")}><Input type="date" {...register("endDate")} /></Field>
          <Controller control={form.control} name="isCurrent" render={({ field }) => <label className="col-span-2 flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Current season</label>} />
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
