import { z } from "zod";
import { dateString, optionalDate, optionalId, optionalInt, optionalPhone, optionalText, requiredText } from "./common";
import { guardianInput } from "./registration";

export const PLAYER_STATUSES = ["ACTIVE", "PENDING", "TRIAL", "SUSPENDED", "INACTIVE", "GRADUATED", "TRANSFERRED"] as const;
export const POSITIONS = ["Goalkeeper", "Centre-back", "Full-back", "Wing-back", "Defensive midfielder", "Central midfielder", "Attacking midfielder", "Winger", "Striker"] as const;
export const JERSEY_SIZES = ["YXS", "YS", "YM", "YL", "YXL", "S", "M", "L", "XL"] as const;

export const playerSchema = z.object({
  id: optionalId,
  branchId: z.string().min(1, "Choose a branch"),
  firstName: requiredText("First name", 80),
  middleName: optionalText(80),
  lastName: requiredText("Last name", 80),
  preferredName: optionalText(80),
  dateOfBirth: dateString("Date of birth"),
  gender: z.enum(["MALE", "FEMALE"]),
  nationality: optionalText(60),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: optionalPhone,
  status: z.enum(PLAYER_STATUSES),
  ageGroupId: optionalId,
  primaryCoachId: optionalId,
  preferredPosition: optionalText(40),
  secondaryPosition: optionalText(40),
  dominantFoot: z.enum(["LEFT", "RIGHT", "BOTH"]).optional().or(z.literal("")).transform((v) => v || undefined),
  previousExperience: optionalText(1000),
  jerseyNumber: optionalInt(0, 99),
  jerseySize: optionalText(10),
  schoolName: optionalText(120),
  registrationDate: optionalDate,
  notes: optionalText(2000),
  photoConsent: z.boolean(),
  videoConsent: z.boolean(),
});
export type PlayerFormValues = z.input<typeof playerSchema>;

export const newPlayerSchema = playerSchema.extend({
  guardian: guardianInput,
  openingCredits: optionalInt(0, 200),
});
export type NewPlayerFormValues = z.input<typeof newPlayerSchema>;

export const medicalSchema = z.object({
  playerId: z.string().min(1),
  conditions: optionalText(2000),
  allergies: optionalText(1000),
  medications: optionalText(1000),
  emergencyInstructions: optionalText(2000),
  bloodGroup: optionalText(5),
  doctorName: optionalText(120),
  doctorPhone: optionalPhone,
  clearanceStatus: z.enum(["PENDING", "CLEARED", "NOT_CLEARED", "EXPIRED"]),
  clearanceExpiresAt: optionalDate,
});

export const linkGuardianSchema = guardianInput.extend({
  playerId: z.string().min(1),
  isPrimary: z.boolean().default(false),
  receivesBilling: z.boolean().default(true),
});

export const transferSchema = z.object({
  playerId: z.string().min(1),
  toBranchId: z.string().min(1),
  toAgeGroupId: optionalId,
  reason: requiredText("Reason", 500),
});

export const creditAdjustSchema = z.object({
  playerId: z.string().min(1),
  delta: z.coerce.number().int().min(-100).max(100).refine((v) => v !== 0, "Enter a non-zero amount"),
  type: z.enum(["MANUAL_ADJUSTMENT", "MAKEUP_GRANT"]),
  reason: requiredText("Reason", 300),
});

export const achievementSchema = z.object({
  playerId: z.string().min(1),
  title: requiredText("Title", 120),
  description: optionalText(500),
  awardedOn: dateString(),
});
