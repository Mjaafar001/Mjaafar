"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch, Checkbox } from "@/components/ui/switch";
import { Field, FormSection, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { AcademyMark } from "@/components/layout/logo";
import { settingsSchema, type SettingsFormValues } from "@/lib/validators/operations";
import { updateSettings, uploadLogo } from "./actions";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED", "INJURED"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function AcademySettingsForm({ defaults, logoUrl }: { defaults: SettingsFormValues; logoUrl: string | null }) {
  const router = useRouter();
  const { form, onSubmit, errors, submitting } = useActionForm({ schema: settingsSchema, action: updateSettings, defaultValues: defaults });
  const { register, control, watch } = form;
  const [uploading, startUpload] = React.useTransition();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
          <AcademyMark logoUrl={logoUrl} className="size-16" />
          <div className="flex-1">
            <p className="font-semibold">Academy logo</p>
            <p className="text-sm text-muted">PNG, JPEG or WebP up to 5 MB. Shown in the sidebar, sign-in page and parent portal.</p>
          </div>
          <form action={(fd) => startUpload(async () => { const r = await uploadLogo(fd); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error); })} className="flex items-center gap-2">
            <Input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required className="max-w-56 py-1.5" aria-label="Logo file" />
            <Button type="submit" variant="outline" disabled={uploading}><Upload /> Upload</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-6 pt-6">
            <FormSection title="Identity" description="Name and brand colours used across the system.">
              <Field label="Academy name" required error={err(errors, "name")}><Input {...register("name")} /></Field>
              <Field label="Short name" required error={err(errors, "shortName")} hint="Used in the sidebar"><Input {...register("shortName")} /></Field>
              <Field label="Primary colour" error={err(errors, "primaryColor")}>
                <div className="flex gap-2"><input type="color" className="h-10 w-12 cursor-pointer rounded border bg-surface" value={watch("primaryColor")} onChange={(e) => form.setValue("primaryColor", e.target.value, { shouldDirty: true })} aria-label="Pick primary colour" /><Input {...register("primaryColor")} /></div>
              </Field>
              <Field label="Accent colour" error={err(errors, "accentColor")}>
                <div className="flex gap-2"><input type="color" className="h-10 w-12 cursor-pointer rounded border bg-surface" value={watch("accentColor")} onChange={(e) => form.setValue("accentColor", e.target.value, { shouldDirty: true })} aria-label="Pick accent colour" /><Input {...register("accentColor")} /></div>
              </Field>
              <Field label="Academy ID prefix" error={err(errors, "academyIdPrefix")} hint="e.g. MJA → MJA-26-0001"><Input {...register("academyIdPrefix")} /></Field>
            </FormSection>

            <FormSection title="Contact" description="Shown to parents on invoices and the portal.">
              <Field label="Email" error={err(errors, "contactEmail")}><Input type="email" {...register("contactEmail")} /></Field>
              <Field label="Phone" error={err(errors, "contactPhone")}><Input {...register("contactPhone")} /></Field>
              <Field label="Address" className="sm:col-span-2" error={err(errors, "address")}><Input {...register("address")} /></Field>
              <Field label="Website" error={err(errors, "website")}><Input {...register("website")} /></Field>
            </FormSection>

            <FormSection title="Regional" description="Defaults for Nigeria.">
              <Field label="Currency"><Input value="NGN — Nigerian Naira" disabled /></Field>
              <Field label="Time zone" error={err(errors, "timezone")}>
                <NativeSelect {...register("timezone")}><option value="Africa/Lagos">Africa/Lagos (WAT)</option></NativeSelect>
              </Field>
              <Field label="Age-group cutoff month" hint="Player age is calculated on this date each year">
                <NativeSelect {...register("ageCutoffMonth")}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</NativeSelect>
              </Field>
              <Field label="Cutoff day" error={err(errors, "ageCutoffDay")}><Input type="number" min={1} max={31} {...register("ageCutoffDay")} /></Field>
            </FormSection>

            <FormSection title="Training & fees" description="Defaults for new subscription plans. Payments arrive in Phase 3.">
              <Field label="Monthly training fee (₦)" error={err(errors, "defaultMonthlyFeeNaira")}><Input type="number" step="100" {...register("defaultMonthlyFeeNaira")} /></Field>
              <Field label="Sessions per package" error={err(errors, "defaultSessionsPerPackage")}><Input type="number" {...register("defaultSessionsPerPackage")} /></Field>
              <Field label="Session duration (minutes)" error={err(errors, "defaultSessionMinutes")}><Input type="number" {...register("defaultSessionMinutes")} /></Field>
              <Field label="Registration fee (₦)" error={err(errors, "registrationFeeNaira")}><Input type="number" step="100" {...register("registrationFeeNaira")} /></Field>
              <Field label="Payment instructions" className="sm:col-span-2" error={err(errors, "paymentInstructions")}><Textarea rows={3} {...register("paymentInstructions")} /></Field>
            </FormSection>

            <FormSection title="Attendance policy" description="How attendance uses session credits.">
              <Field label="Statuses that use a session credit" className="sm:col-span-2">
                <Controller control={control} name="creditDeductStatuses" render={({ field }) => (
                  <div className="flex flex-wrap gap-4">
                    {STATUSES.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={field.value?.includes(s)} onChange={(e) => field.onChange(e.target.checked ? [...(field.value ?? []), s] : (field.value ?? []).filter((x) => x !== s))} />
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </label>
                    ))}
                  </div>
                )} />
              </Field>
              <Controller control={control} name="allowAttendanceWithoutCredit" render={({ field }) => (
                <label className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                  <span><span className="block text-sm font-medium">Allow players with no remaining credits to attend</span><span className="text-xs text-muted">When off, coaches can&apos;t mark them present until they renew.</span></span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )} />
            </FormSection>

            <FormSection title="Security & data" description="Protection for children's data (NDPA 2023).">
              <Controller control={control} name="mfaRequiredForPrivileged" render={({ field }) => (
                <label className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                  <span><span className="block text-sm font-medium">Require two-factor authentication for privileged roles</span><span className="text-xs text-muted">President, administrators and accountants.</span></span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )} />
              <Field label="Retain records of departed players for (months)" error={err(errors, "dataRetentionMonths")}><Input type="number" {...register("dataRetentionMonths")} /></Field>
            </FormSection>
          </CardContent>
          <div className="sticky bottom-16 flex justify-end gap-2 rounded-b-lg border-t bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-0">
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save settings"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
