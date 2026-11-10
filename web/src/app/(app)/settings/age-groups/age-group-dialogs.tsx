"use client";
import * as React from "react";
import { Controller } from "react-hook-form";
import { Merge, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { ageGroupSchema, mergeAgeGroupSchema } from "@/lib/validators/operations";
import { saveAgeGroup, mergeAgeGroups } from "../actions";
import type { z } from "zod";

type Values = z.input<typeof ageGroupSchema>;

export function AgeGroupDialog({ group, branches }: { group?: Values; branches: { value: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: ageGroupSchema,
    action: saveAgeGroup,
    defaultValues: group ?? { branchId: branches[0]?.value ?? "", name: "", code: "", color: "#13804f", sortOrder: 0, isActive: true, minAge: "", maxAgeExclusive: "", capacity: "", description: "" },
    onSuccess: () => { setOpen(false); if (!group) form.reset(); },
  });
  const { register, control } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {group ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button><Plus /> New age group</Button>}
      </DialogTrigger>
      <DialogContent title={group ? `Edit ${group.name}` : "New age group"} description="Changes apply immediately. Players keep their group when it is renamed.">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Branch" required className="col-span-2" error={err(errors, "branchId")}>
            <NativeSelect {...register("branchId")}>{branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</NativeSelect>
          </Field>
          <Field label="Name" required error={err(errors, "name")}><Input {...register("name")} placeholder="Under-12" /></Field>
          <Field label="Code" required error={err(errors, "code")}><Input {...register("code")} placeholder="U12" /></Field>
          <Field label="Minimum age" error={err(errors, "minAge")} hint="Optional"><Input type="number" {...register("minAge")} /></Field>
          <Field label="Under age (exclusive)" error={err(errors, "maxAgeExclusive")} hint="12 for Under-12"><Input type="number" {...register("maxAgeExclusive")} /></Field>
          <Field label="Capacity" error={err(errors, "capacity")} hint="Blank for unlimited"><Input type="number" {...register("capacity")} /></Field>
          <Field label="Colour" error={err(errors, "color")}><Input type="color" className="p-1" {...register("color")} /></Field>
          <Field label="Display order" error={err(errors, "sortOrder")}><Input type="number" {...register("sortOrder")} /></Field>
          <Controller control={control} name="isActive" render={({ field }) => (
            <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>
          )} />
          <Field label="Description" className="col-span-2" error={err(errors, "description")}><Textarea rows={2} {...register("description")} /></Field>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MergeDialog({ groups }: { groups: { id: string; name: string; branchId: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: mergeAgeGroupSchema, action: mergeAgeGroups, defaultValues: { sourceId: "", targetId: "" }, onSuccess: () => setOpen(false) });
  const source = groups.find((g) => g.id === form.watch("sourceId"));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Merge /> Merge groups</Button></DialogTrigger>
      <DialogContent title="Merge age groups" description="Players, coach assignments and future sessions move to the target group. The source group is deactivated (kept for history).">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Merge this group" error={err(errors, "sourceId")}>
            <NativeSelect {...form.register("sourceId")}><option value="">Choose…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
          </Field>
          <Field label="Into" error={err(errors, "targetId")}>
            <NativeSelect {...form.register("targetId")}><option value="">Choose…</option>{groups.filter((g) => g.id !== source?.id && (!source || g.branchId === source.branchId)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={submitting}>Merge</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
