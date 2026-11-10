"use client";
import * as React from "react";
import { Controller } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { branchSchema } from "@/lib/validators/operations";
import { saveBranch } from "../actions";

export function BranchDialog({ branch }: { branch?: z.input<typeof branchSchema> }) {
  const [open, setOpen] = React.useState(false);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: branchSchema, action: saveBranch,
    defaultValues: branch ?? { name: "", code: "", address: "", city: "", state: "", phone: "", email: "", isActive: true },
    onSuccess: () => { setOpen(false); if (!branch) form.reset(); },
  });
  const { register } = form;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{branch ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button><Plus /> New branch</Button>}</DialogTrigger>
      <DialogContent title={branch ? `Edit ${branch.name}` : "New branch"}>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Field label="Name" required error={err(errors, "name")}><Input {...register("name")} /></Field>
          <Field label="Code" required error={err(errors, "code")} hint="e.g. LEK"><Input {...register("code")} /></Field>
          <Field label="Address" className="col-span-2" error={err(errors, "address")}><Input {...register("address")} /></Field>
          <Field label="City" error={err(errors, "city")}><Input {...register("city")} /></Field>
          <Field label="State" error={err(errors, "state")}><Input {...register("state")} /></Field>
          <Field label="Phone" error={err(errors, "phone")}><Input {...register("phone")} /></Field>
          <Field label="Email" error={err(errors, "email")}><Input {...register("email")} /></Field>
          <Controller control={form.control} name="isActive" render={({ field }) => <label className="col-span-2 flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Active</label>} />
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
