"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FormSection, err } from "@/components/forms/field";
import { useActionForm } from "@/components/forms/use-action-form";
import { newPlayerSchema, playerSchema, PLAYER_STATUSES, POSITIONS, JERSEY_SIZES, type NewPlayerFormValues, type PlayerFormValues } from "@/lib/validators/player";
import { suggestAgeGroup } from "@/lib/services/age-group-rules";
import { parseDateOnly } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { createPlayer, updatePlayer } from "./actions";

export type PlayerFormOptions = {
  branches: { id: string; name: string }[];
  groups: { id: string; name: string; branchId: string; minAge: number | null; maxAgeExclusive: number | null; isActive: boolean; sortOrder: number }[];
  coaches: { id: string; name: string; branchId: string }[];
  cutoff: { month: number; day: number };
  canTransfer: boolean;
};

export function PlayerForm({ mode, defaults, options }: { mode: "create" | "edit"; defaults: NewPlayerFormValues | PlayerFormValues; options: PlayerFormOptions }) {
  const router = useRouter();
  const { form, onSubmit, errors, submitting } = useActionForm({
    schema: mode === "create" ? newPlayerSchema : playerSchema,
    action: mode === "create" ? createPlayer : updatePlayer,
    defaultValues: defaults as NewPlayerFormValues,
    refresh: false,
    onSuccess: (res) => {
      const id = (res.data as { id?: string } | undefined)?.id ?? (defaults as PlayerFormValues).id;
      router.push(`/players/${id}`);
      router.refresh();
    },
  });
  const { register, control, watch, setValue } = form;
  const branchId = watch("branchId");
  const dob = watch("dateOfBirth");
  const groups = options.groups.filter((g) => g.branchId === branchId && g.isActive);
  const suggestion = React.useMemo(() => (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? suggestAgeGroup(parseDateOnly(dob), groups, options.cutoff) : null), [dob, groups, options.cutoff]);

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6 pt-6">
          <FormSection title="Player" description="Personal details. Age is calculated automatically.">
            <Field label="First name" required error={err(errors, "firstName")}><Input {...register("firstName")} autoComplete="off" /></Field>
            <Field label="Last name" required error={err(errors, "lastName")}><Input {...register("lastName")} autoComplete="off" /></Field>
            <Field label="Middle name" error={err(errors, "middleName")}><Input {...register("middleName")} /></Field>
            <Field label="Preferred name" error={err(errors, "preferredName")}><Input {...register("preferredName")} /></Field>
            <Field label="Date of birth" required error={err(errors, "dateOfBirth")}><Input type="date" {...register("dateOfBirth")} /></Field>
            <Field label="Gender" required error={err(errors, "gender")}>
              <NativeSelect {...register("gender")}><option value="MALE">Male</option><option value="FEMALE">Female</option></NativeSelect>
            </Field>
            <Field label="Nationality" error={err(errors, "nationality")}><Input {...register("nationality")} /></Field>
            <Field label="Player phone" error={err(errors, "phone")} hint="Only for older players"><Input {...register("phone")} /></Field>
            <Field label="Address" className="sm:col-span-2" error={err(errors, "address")}><Input {...register("address")} /></Field>
            <Field label="City" error={err(errors, "city")}><Input {...register("city")} /></Field>
            <Field label="State" error={err(errors, "state")}><Input {...register("state")} /></Field>
            <Field label="School" error={err(errors, "schoolName")}><Input {...register("schoolName")} /></Field>
          </FormSection>

          <FormSection title="Academy" description="Branch, age group and coach.">
            <Field label="Branch" required error={err(errors, "branchId")}>
              <NativeSelect {...register("branchId")} disabled={mode === "edit" && !options.canTransfer} onChange={(e) => { setValue("branchId", e.target.value); setValue("ageGroupId", ""); setValue("primaryCoachId", ""); }}>
                {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Status" required error={err(errors, "status")}>
              <NativeSelect {...register("status")}>{PLAYER_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</NativeSelect>
            </Field>
            <Field label="Age group" error={err(errors, "ageGroupId")}>
              <NativeSelect {...register("ageGroupId")}><option value="">Unassigned</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
              {suggestion && watch("ageGroupId") !== suggestion.id ? (
                <button type="button" onClick={() => setValue("ageGroupId", suggestion.id, { shouldDirty: true })} className="flex items-center gap-1 text-left text-xs font-medium text-primary hover:underline">
                  <Sparkles className="size-3" /> Suggested by age: {suggestion.name}
                </button>
              ) : null}
            </Field>
            <Field label="Primary coach" error={err(errors, "primaryCoachId")}>
              <NativeSelect {...register("primaryCoachId")}><option value="">None</option>{options.coaches.filter((c) => c.branchId === branchId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Registration date" error={err(errors, "registrationDate")}><Input type="date" {...register("registrationDate")} /></Field>
            {mode === "create" ? <Field label="Opening session credits" error={err(errors, "openingCredits")} hint="Optional — e.g. sessions already paid for"><Input type="number" min={0} {...register("openingCredits" as never)} /></Field> : null}
          </FormSection>

          <FormSection title="Football" description="Position, foot and kit.">
            <Field label="Preferred position" error={err(errors, "preferredPosition")}>
              <NativeSelect {...register("preferredPosition")}><option value="">—</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</NativeSelect>
            </Field>
            <Field label="Secondary position" error={err(errors, "secondaryPosition")}>
              <NativeSelect {...register("secondaryPosition")}><option value="">—</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</NativeSelect>
            </Field>
            <Field label="Dominant foot" error={err(errors, "dominantFoot")}>
              <NativeSelect {...register("dominantFoot")}><option value="">—</option><option value="RIGHT">Right</option><option value="LEFT">Left</option><option value="BOTH">Both</option></NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Jersey no." error={err(errors, "jerseyNumber")}><Input type="number" min={0} max={99} {...register("jerseyNumber")} /></Field>
              <Field label="Jersey size" error={err(errors, "jerseySize")}><NativeSelect {...register("jerseySize")}><option value="">—</option>{JERSEY_SIZES.map((s) => <option key={s}>{s}</option>)}</NativeSelect></Field>
            </div>
            <Field label="Previous football experience" className="sm:col-span-2" error={err(errors, "previousExperience")}><Textarea rows={2} {...register("previousExperience")} /></Field>
          </FormSection>

          {mode === "create" ? (
            <FormSection title="Parent / guardian" description="If this parent already has a child here, they are linked automatically (matched by phone or email).">
              <Field label="First name" required error={err(errors, "guardian.firstName")}><Input {...register("guardian.firstName" as never)} /></Field>
              <Field label="Last name" required error={err(errors, "guardian.lastName")}><Input {...register("guardian.lastName" as never)} /></Field>
              <Field label="Relationship" required error={err(errors, "guardian.relationship")}>
                <NativeSelect {...register("guardian.relationship" as never)}>{["Mother", "Father", "Guardian", "Grandparent", "Aunt", "Uncle", "Sibling", "Other"].map((r) => <option key={r}>{r}</option>)}</NativeSelect>
              </Field>
              <Field label="Phone" required error={err(errors, "guardian.phone")}><Input type="tel" {...register("guardian.phone" as never)} placeholder="0803 123 4567" /></Field>
              <Field label="WhatsApp" error={err(errors, "guardian.whatsapp")} hint="Leave blank if same as phone"><Input type="tel" {...register("guardian.whatsapp" as never)} /></Field>
              <Field label="Email" error={err(errors, "guardian.email")}><Input type="email" {...register("guardian.email" as never)} /></Field>
            </FormSection>
          ) : null}

          <FormSection title="Consent & notes" description="Media consent from the parent or guardian.">
            <Controller control={control} name="photoConsent" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Photo consent</label>} />
            <Controller control={control} name="videoConsent" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={field.value} onCheckedChange={field.onChange} /> Video consent</label>} />
            <Field label="Internal notes" className="sm:col-span-2" error={err(errors, "notes")}><Textarea rows={3} {...register("notes")} /></Field>
          </FormSection>
        </CardContent>
        <div className="sticky bottom-16 flex justify-end gap-2 rounded-b-lg border-t bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-0">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : mode === "create" ? "Register player" : "Save changes"}</Button>
        </div>
      </form>
    </Card>
  );
}
