"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/misc";
import { Field, FormSection, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { staffSchema, STAFF_TYPES, type StaffFormValues } from "@/lib/validators/operations";
import { humanize } from "@/lib/utils";
import { saveStaff } from "./actions";

export function StaffForm({ defaults, branches, groups, hasLogin, canCreateLogin }: { defaults: StaffFormValues; branches: { id: string; name: string }[]; groups: { id: string; name: string; branchId: string; color: string }[]; hasLogin: boolean; canCreateLogin: boolean }) {
  const router = useRouter();
  const [link, setLink] = React.useState<{ link: string; id: string } | null>(null);
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: staffSchema, action: saveStaff, defaultValues: defaults, refresh: false,
    onSuccess: (res) => {
      const data = res.data as { id: string; link?: string };
      if (data.link) setLink({ link: data.link, id: data.id });
      else { router.push(`/staff/${data.id}`); router.refresh(); }
    },
  });
  const { register, control, watch } = form;
  const branchId = watch("branchId");

  if (link) {
    return (
      <Alert tone="success" title="Staff member saved and login created">
        <p className="mb-2">Send this one-time link privately so they can set a password:</p>
        <div className="flex gap-2"><Input readOnly value={link.link} className="text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(link.link); toast.success("Copied"); }}><Copy /></Button></div>
        <Button className="mt-3" onClick={() => router.push(`/staff/${link.id}`)}>Open profile</Button>
      </Alert>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6 pt-6">
          <FormSection title="Person">
            <Field label="First name" required error={err(errors, "firstName")}><Input {...register("firstName")} /></Field>
            <Field label="Last name" required error={err(errors, "lastName")}><Input {...register("lastName")} /></Field>
            <Field label="Email" error={err(errors, "email")}><Input type="email" {...register("email")} /></Field>
            <Field label="Phone" error={err(errors, "phone")}><Input type="tel" {...register("phone")} /></Field>
            <Field label="Emergency contact" error={err(errors, "emergencyContactName")}><Input {...register("emergencyContactName")} /></Field>
            <Field label="Emergency phone" error={err(errors, "emergencyContactPhone")}><Input type="tel" {...register("emergencyContactPhone")} /></Field>
          </FormSection>
          <FormSection title="Employment">
            <Field label="Branch" required error={err(errors, "branchId")}><NativeSelect {...register("branchId")}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></Field>
            <Field label="Role" required error={err(errors, "staffType")}><NativeSelect {...register("staffType")}>{STAFF_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</NativeSelect></Field>
            <Field label="Job title" error={err(errors, "jobTitle")}><Input {...register("jobTitle")} /></Field>
            <Field label="Start date" error={err(errors, "startDate")}><Input type="date" {...register("startDate")} /></Field>
            <Field label="Status" error={err(errors, "employmentStatus")}><NativeSelect {...register("employmentStatus")}>{["ACTIVE", "PROBATION", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</NativeSelect></Field>
            <Field label="Contract" error={err(errors, "employmentType")}><NativeSelect {...register("employmentType")}>{["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</NativeSelect></Field>
          </FormSection>
          <FormSection title="Coaching" description="Assigned age groups control which players a coach can see.">
            <Field label="Assigned age groups" className="sm:col-span-2">
              <Controller control={control} name="ageGroupIds" render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {groups.filter((g) => g.branchId === branchId).map((g) => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                      <Checkbox checked={field.value?.includes(g.id)} onChange={(e) => field.onChange(e.target.checked ? [...(field.value ?? []), g.id] : (field.value ?? []).filter((x) => x !== g.id))} />
                      <span className="size-2 rounded-full" style={{ background: g.color }} />{g.name}
                    </label>
                  ))}
                </div>
              )} />
            </Field>
            <Field label="Qualifications" className="sm:col-span-2" error={err(errors, "qualifications")}><Textarea rows={2} {...register("qualifications")} placeholder="Licences, courses, degrees" /></Field>
            <Field label="Bio" className="sm:col-span-2" error={err(errors, "bio")}><Textarea rows={2} {...register("bio")} /></Field>
          </FormSection>
          {!hasLogin && canCreateLogin ? (
            <FormSection title="System access">
              <Controller control={control} name="createLogin" render={({ field }) => (
                <label className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                  <span><span className="block text-sm font-medium">Create a login for this person</span><span className="text-xs text-muted">Grants the matching role (coach, head coach, administrator or accountant) for this branch.</span></span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )} />
            </FormSection>
          ) : null}
        </CardContent>
        <div className="sticky bottom-16 flex justify-end gap-2 rounded-b-lg border-t bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-0">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
