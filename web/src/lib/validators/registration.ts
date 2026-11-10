import { z } from "zod";
import { dateString, email, optionalEmail, optionalPhone, optionalText, phone, requiredText } from "./common";

export const guardianInput = z.object({
  firstName: requiredText("First name", 80),
  lastName: requiredText("Last name", 80),
  relationship: requiredText("Relationship", 40),
  phone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  address: optionalText(300),
  occupation: optionalText(120),
});

export const applicationSchema = z
  .object({
    branchId: z.string().min(1, "Choose a branch"),
    type: z.enum(["FULL", "TRIAL"]),
    requestedAgeGroupId: z.string().optional().or(z.literal("")).transform((v) => v || undefined),
    child: z.object({
      firstName: requiredText("First name", 80),
      middleName: optionalText(80),
      lastName: requiredText("Last name", 80),
      dateOfBirth: dateString("Date of birth"),
      gender: z.enum(["MALE", "FEMALE"]),
      nationality: optionalText(60),
      address: optionalText(300),
      city: optionalText(80),
      state: optionalText(80),
      schoolName: optionalText(120),
      preferredPosition: optionalText(40),
      dominantFoot: z.enum(["LEFT", "RIGHT", "BOTH"]).optional().or(z.literal("")).transform((v) => v || undefined),
      previousExperience: optionalText(1000),
      jerseySize: optionalText(10),
    }),
    guardians: z.array(guardianInput).min(1, "At least one parent or guardian is required").max(3),
    emergencyContacts: z
      .array(z.object({ name: optionalText(120), phone: optionalPhone, relationship: optionalText(40) }))
      .max(3)
      .optional(),
    medical: z.object({
      conditions: optionalText(2000),
      allergies: optionalText(1000),
      medications: optionalText(1000),
      emergencyInstructions: optionalText(2000),
      doctorName: optionalText(120),
      doctorPhone: optionalPhone,
    }),
    consents: z.object({
      participation: z.literal(true, { error: "Participation consent is required" }),
      medicalTreatment: z.literal(true, { error: "Emergency medical treatment consent is required" }),
      dataProcessing: z.literal(true, { error: "Data processing consent is required (NDPA)" }),
      photo: z.boolean(),
      video: z.boolean(),
      signedName: requiredText("Signature (full name)", 120),
    }),
    // Honeypot: real users never fill this.
    website: z.string().max(0).optional(),
  })
  .refine((v) => {
    const dob = new Date(v.child.dateOfBirth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 86400000);
    return age >= 3 && age <= 21;
  }, { message: "Players must be between 3 and 21 years old", path: ["child", "dateOfBirth"] });

export type ApplicationInput = z.output<typeof applicationSchema>;
export type ApplicationFormValues = z.input<typeof applicationSchema>;

export const CONSENT_VERSION = "2026-11";

export const reviewSchema = z.object({
  registrationId: z.string().min(1),
  decision: z.enum(["APPROVE", "APPROVE_TRIAL", "WAITLIST", "REJECT", "UNDER_REVIEW", "SCHEDULE_TRIAL"]),
  ageGroupId: z.string().optional().or(z.literal("")).transform((v) => v || undefined),
  trialDate: z.string().optional().or(z.literal("")).transform((v) => v || undefined),
  notes: optionalText(1000),
});

export const loginSchema = z.object({ email, password: z.string().min(1, "Password is required").max(200) });
