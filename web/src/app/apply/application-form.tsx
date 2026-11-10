"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { Field, err } from "@/components/forms/field";
import { applicationSchema, type ApplicationFormValues, type ApplicationInput } from "@/lib/validators/registration";
import { suggestAgeGroup } from "@/lib/services/age-group-rules";
import { parseDateOnly } from "@/lib/dates";
import { POSITIONS, JERSEY_SIZES } from "@/lib/validators/player";
import { cn } from "@/lib/utils";
import { submitApplication } from "./actions";

type Branch = { id: string; name: string; ageGroups: { id: string; name: string; minAge: number | null; maxAgeExclusive: number | null; isActive: boolean; sortOrder: number }[] };

const STEPS = [
  { title: "Child", fields: ["branchId", "type", "requestedAgeGroupId", "child"] },
  { title: "Parents", fields: ["guardians", "emergencyContacts"] },
  { title: "Medical", fields: ["medical"] },
  { title: "Consent", fields: ["consents"] },
] as const;
const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Aunt", "Uncle", "Sibling", "Other"];

export function ApplicationForm({ branches, cutoff }: { branches: Branch[]; cutoff: { month: number; day: number } }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<File | null>(null);
  const form = useForm<ApplicationFormValues, unknown, ApplicationInput>({
    resolver: zodResolver(applicationSchema) as unknown as Resolver<ApplicationFormValues, unknown, ApplicationInput>,
    mode: "onTouched",
    defaultValues: {
      branchId: branches[0]?.id ?? "", type: "FULL", requestedAgeGroupId: "",
      child: { firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "MALE", nationality: "Nigerian", address: "", city: "", state: "", schoolName: "", preferredPosition: "", dominantFoot: "", previousExperience: "", jerseySize: "" },
      guardians: [{ firstName: "", lastName: "", relationship: "Mother", phone: "", whatsapp: "", email: "", address: "", occupation: "" }],
      emergencyContacts: [{ name: "", phone: "", relationship: "" }],
      medical: { conditions: "", allergies: "", medications: "", emergencyInstructions: "", doctorName: "", doctorPhone: "" },
      consents: { participation: false as unknown as true, medicalTreatment: false as unknown as true, dataProcessing: false as unknown as true, photo: false, video: false, signedName: "" },
      website: "",
    },
  });
  const { register, control, watch, setValue, formState: { errors, isSubmitting } } = form;
  const guardians = useFieldArray({ control, name: "guardians" });
  const branch = branches.find((b) => b.id === watch("branchId"));
  const dob = watch("child.dateOfBirth");
  const suggestion = React.useMemo(() => (branch && dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? suggestAgeGroup(parseDateOnly(dob), branch.ageGroups, cutoff) : null), [branch, dob, cutoff]);

  React.useEffect(() => {
    if (suggestion && !form.getValues("requestedAgeGroupId")) setValue("requestedAgeGroupId", suggestion.id);
  }, [suggestion, setValue, form]);

  const next = async () => {
    const ok = await form.trigger(STEPS[step]!.fields as unknown as Parameters<typeof form.trigger>[0]);
    if (ok) { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const fd = new FormData();
    fd.set("data", JSON.stringify({ ...values, website: (document.getElementById("website") as HTMLInputElement | null)?.value ?? "" }));
    if (file) fd.set("birthCertificate", file);
    const res = await submitApplication(fd);
    if (res.ok) router.push(`/apply/success?ref=${encodeURIComponent(res.data?.reference ?? "")}`);
    else {
      toast.error(res.error);
      if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as never, { message: v[0] });
    }
  });

  return (
    <Card className="shadow-lg">
      <ol className="grid grid-cols-4 border-b">
        {STEPS.map((s, i) => (
          <li key={s.title} className={cn("flex items-center justify-center gap-2 py-4 text-xs font-semibold uppercase tracking-wider text-muted sm:text-sm", i === step && "text-foreground", i < step && "text-primary")}>
            <span className={cn("grid size-6 place-items-center rounded-full border text-[11px]", i === step && "border-primary bg-primary text-white", i < step && "border-primary bg-primary-soft")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
            <span className="hidden sm:inline">{s.title}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="pt-6">
          {/* Honeypot (hidden from people, attractive to bots) */}
          <input id="website" name="website" tabIndex={-1} autoComplete="off" className="absolute left-[-9999px]" aria-hidden />

          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application type" required className="sm:col-span-2">
                <Controller control={control} name="type" render={({ field }) => (
                  <div className="grid grid-cols-2 gap-3">
                    {([["FULL", "Full registration", "Join the academy"], ["TRIAL", "Trial session", "Try a session first"]] as const).map(([v, t, d]) => (
                      <button type="button" key={v} onClick={() => field.onChange(v)} className={cn("rounded-lg border p-4 text-left transition-colors", field.value === v ? "border-primary bg-primary-soft ring-1 ring-primary" : "hover:bg-surface-2")}>
                        <span className="block font-semibold">{t}</span><span className="text-sm text-muted">{d}</span>
                      </button>
                    ))}
                  </div>
                )} />
              </Field>
              <Field label="Branch" required error={err(errors, "branchId")}>
                <NativeSelect {...register("branchId")} onChange={(e) => { setValue("branchId", e.target.value); setValue("requestedAgeGroupId", ""); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect>
              </Field>
              <Field label="Child's date of birth" required error={err(errors, "child.dateOfBirth")}><Input type="date" {...register("child.dateOfBirth")} max={new Date().toISOString().slice(0, 10)} /></Field>
              <Field label="First name" required error={err(errors, "child.firstName")}><Input {...register("child.firstName")} autoComplete="off" /></Field>
              <Field label="Last name" required error={err(errors, "child.lastName")}><Input {...register("child.lastName")} autoComplete="off" /></Field>
              <Field label="Middle name" error={err(errors, "child.middleName")}><Input {...register("child.middleName")} autoComplete="off" /></Field>
              <Field label="Gender" required error={err(errors, "child.gender")}><NativeSelect {...register("child.gender")}><option value="MALE">Male</option><option value="FEMALE">Female</option></NativeSelect></Field>
              <Field label="Age group" error={err(errors, "requestedAgeGroupId")} hint={suggestion ? undefined : "Enter the date of birth for a suggestion"}>
                <NativeSelect {...register("requestedAgeGroupId")}><option value="">Not sure</option>{branch?.ageGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
                {suggestion ? <span className="flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3" /> Suggested for this age: {suggestion.name}</span> : null}
              </Field>
              <Field label="Nationality" error={err(errors, "child.nationality")}><Input {...register("child.nationality")} /></Field>
              <Field label="Home address" className="sm:col-span-2" error={err(errors, "child.address")}><Input {...register("child.address")} /></Field>
              <Field label="City" error={err(errors, "child.city")}><Input {...register("child.city")} /></Field>
              <Field label="State" error={err(errors, "child.state")}><Input {...register("child.state")} /></Field>
              <Field label="School" error={err(errors, "child.schoolName")}><Input {...register("child.schoolName")} /></Field>
              <Field label="Preferred position" error={err(errors, "child.preferredPosition")}><NativeSelect {...register("child.preferredPosition")}><option value="">Not sure</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</NativeSelect></Field>
              <Field label="Stronger foot" error={err(errors, "child.dominantFoot")}><NativeSelect {...register("child.dominantFoot")}><option value="">Not sure</option><option value="RIGHT">Right</option><option value="LEFT">Left</option><option value="BOTH">Both</option></NativeSelect></Field>
              <Field label="Jersey size" error={err(errors, "child.jerseySize")}><NativeSelect {...register("child.jerseySize")}><option value="">Not sure</option>{JERSEY_SIZES.map((s) => <option key={s}>{s}</option>)}</NativeSelect></Field>
              <Field label="Previous football experience" className="sm:col-span-2" error={err(errors, "child.previousExperience")}><Textarea rows={2} {...register("child.previousExperience")} placeholder="Clubs, school team, years playing…" /></Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-6">
              {guardians.fields.map((f, i) => (
                <div key={f.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg font-semibold uppercase">{i === 0 ? "Parent / guardian" : `Additional guardian ${i}`}</h3>{i > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => guardians.remove(i)}><Trash2 /> Remove</Button> : null}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" required error={err(errors, `guardians.${i}.firstName`)}><Input {...register(`guardians.${i}.firstName`)} autoComplete={i === 0 ? "given-name" : "off"} /></Field>
                    <Field label="Last name" required error={err(errors, `guardians.${i}.lastName`)}><Input {...register(`guardians.${i}.lastName`)} autoComplete={i === 0 ? "family-name" : "off"} /></Field>
                    <Field label="Relationship to child" required error={err(errors, `guardians.${i}.relationship`)}><NativeSelect {...register(`guardians.${i}.relationship`)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</NativeSelect></Field>
                    <Field label="Phone" required error={err(errors, `guardians.${i}.phone`)}><Input type="tel" {...register(`guardians.${i}.phone`)} placeholder="0803 123 4567" autoComplete={i === 0 ? "tel" : "off"} /></Field>
                    <Field label="WhatsApp number" error={err(errors, `guardians.${i}.whatsapp`)} hint="If different from phone"><Input type="tel" {...register(`guardians.${i}.whatsapp`)} /></Field>
                    <Field label="Email" error={err(errors, `guardians.${i}.email`)} hint={i === 0 ? "Used for your parent portal account" : undefined}><Input type="email" {...register(`guardians.${i}.email`)} autoComplete={i === 0 ? "email" : "off"} /></Field>
                    <Field label="Occupation" error={err(errors, `guardians.${i}.occupation`)}><Input {...register(`guardians.${i}.occupation`)} /></Field>
                  </div>
                </div>
              ))}
              {guardians.fields.length < 3 ? <Button type="button" variant="outline" className="w-fit" onClick={() => guardians.append({ firstName: "", lastName: "", relationship: "Father", phone: "", whatsapp: "", email: "", address: "", occupation: "" })}><Plus /> Add another guardian</Button> : null}
              <div className="rounded-lg border p-4">
                <h3 className="mb-1 font-display text-lg font-semibold uppercase">Other emergency contact</h3>
                <p className="mb-3 text-sm text-muted">Someone we can call if we can&apos;t reach a parent (optional).</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Name" error={err(errors, "emergencyContacts.0.name")}><Input {...register("emergencyContacts.0.name")} /></Field>
                  <Field label="Phone" error={err(errors, "emergencyContacts.0.phone")}><Input type="tel" {...register("emergencyContacts.0.phone")} /></Field>
                  <Field label="Relationship" error={err(errors, "emergencyContacts.0.relationship")}><Input {...register("emergencyContacts.0.relationship")} /></Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="rounded-lg bg-info-soft p-3 text-sm text-info sm:col-span-2">This section is encrypted and only visible to authorised staff. It helps us keep your child safe.</p>
              <Field label="Allergies" error={err(errors, "medical.allergies")}><Textarea rows={2} {...register("medical.allergies")} placeholder="None" /></Field>
              <Field label="Medical conditions" error={err(errors, "medical.conditions")}><Textarea rows={2} {...register("medical.conditions")} placeholder="e.g. asthma, sickle cell" /></Field>
              <Field label="Regular medication" error={err(errors, "medical.medications")}><Textarea rows={2} {...register("medical.medications")} /></Field>
              <Field label="Emergency instructions" error={err(errors, "medical.emergencyInstructions")}><Textarea rows={2} {...register("medical.emergencyInstructions")} /></Field>
              <Field label="Family doctor / hospital" error={err(errors, "medical.doctorName")}><Input {...register("medical.doctorName")} /></Field>
              <Field label="Doctor's phone" error={err(errors, "medical.doctorPhone")}><Input type="tel" {...register("medical.doctorPhone")} /></Field>
              <Field label="Birth certificate (optional)" className="sm:col-span-2" hint="PDF or photo, max 5 MB. You can also bring it on the first day.">
                <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-4">
              {([
                ["participation", "I consent to my child taking part in football training, matches and related activities.", true],
                ["medicalTreatment", "In an emergency, I consent to academy staff arranging first aid and medical treatment if I cannot be reached.", true],
                ["dataProcessing", "I consent to the academy processing my and my child's personal data to manage their place, as described in the privacy notice (NDPA 2023).", true],
                ["photo", "The academy may take and use photos of my child for academy communications.", false],
                ["video", "The academy may record video of my child for coaching and communications.", false],
              ] as const).map(([key, text, required]) => (
                <Controller key={key} control={control} name={`consents.${key}` as const} render={({ field }) => (
                  <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 text-sm", err(errors, `consents.${key}`) && "border-danger")}>
                    <Checkbox className="mt-0.5" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                    <span>{text}{required ? <span className="text-danger"> *</span> : <span className="text-muted"> (optional)</span>}{err(errors, `consents.${key}`) ? <span className="block text-xs font-medium text-danger">{err(errors, `consents.${key}`)}</span> : null}</span>
                  </label>
                )} />
              ))}
              <Field label="Signature — type your full name" required error={err(errors, "consents.signedName")}><Input {...register("consents.signedName")} className="font-display text-lg" /></Field>
              <p className="text-xs text-muted">By submitting, you confirm the information is accurate and that you are the child&apos;s parent or legal guardian. The date, time and your typed name are recorded as your digital signature.</p>
            </div>
          ) : null}
        </CardContent>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ChevronLeft /> Back</Button>
          {step < STEPS.length - 1 ? <Button type="button" onClick={next}>Continue <ChevronRight /></Button> : <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting…" : "Submit application"}</Button>}
        </div>
      </form>
    </Card>
  );
}
