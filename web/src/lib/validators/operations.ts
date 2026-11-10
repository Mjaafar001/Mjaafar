import { z } from "zod";
import { dateString, email, hexColor, nairaAmount, optionalDate, optionalEmail, optionalId, optionalInt, optionalPhone, optionalText, requiredText, timeString } from "./common";

export const ageGroupSchema = z
  .object({
    id: optionalId,
    branchId: z.string().min(1, "Choose a branch"),
    name: requiredText("Name", 60),
    code: requiredText("Code", 12).transform((v) => v.toUpperCase()),
    description: optionalText(300),
    minAge: optionalInt(3, 25),
    maxAgeExclusive: optionalInt(4, 26),
    capacity: optionalInt(1, 1000),
    color: hexColor,
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.boolean(),
  })
  .refine((v) => v.minAge == null || v.maxAgeExclusive == null || v.minAge < v.maxAgeExclusive, { message: "Minimum age must be below the 'under' age", path: ["minAge"] });

export const mergeAgeGroupSchema = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }).refine((v) => v.sourceId !== v.targetId, { message: "Choose a different group", path: ["targetId"] });

export const STAFF_TYPES = ["HEAD_COACH", "COACH", "ASSISTANT_COACH", "GOALKEEPER_COACH", "FITNESS_COACH", "ADMINISTRATOR", "ACCOUNTANT", "MEDICAL", "OTHER"] as const;

export const staffSchema = z.object({
  id: optionalId,
  branchId: z.string().min(1, "Choose a branch"),
  firstName: requiredText("First name", 80),
  lastName: requiredText("Last name", 80),
  email: optionalEmail,
  phone: optionalPhone,
  staffType: z.enum(STAFF_TYPES),
  jobTitle: optionalText(80),
  employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "PROBATION", "SUSPENDED", "TERMINATED"]),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"]),
  startDate: optionalDate,
  qualifications: optionalText(1000),
  bio: optionalText(1000),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  ageGroupIds: z.array(z.string()).default([]),
  createLogin: z.boolean().default(false),
});
export type StaffFormValues = z.input<typeof staffSchema>;

export const certificationSchema = z.object({
  staffId: z.string().min(1),
  name: requiredText("Certification", 120),
  issuer: optionalText(120),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
});

export const availabilitySchema = z.object({
  staffId: z.string().min(1),
  slots: z.array(z.object({ weekday: z.coerce.number().int().min(0).max(6), startTime: timeString, endTime: timeString })).max(21),
});

export const sessionSchema = z
  .object({
    id: optionalId,
    branchId: z.string().min(1, "Choose a branch"),
    title: requiredText("Title", 120),
    ageGroupId: optionalId,
    venueId: optionalId,
    coachId: optionalId,
    date: dateString(),
    startTime: timeString,
    durationMinutes: z.coerce.number().int().min(15).max(480),
    capacity: optionalInt(1, 500),
    objectives: optionalText(2000),
    notes: optionalText(2000),
    countsTowardCredits: z.boolean(),
    repeat: z.boolean().default(false),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
    intervalWeeks: z.coerce.number().int().min(1).max(4).default(1),
    repeatUntil: optionalDate,
    allowConflicts: z.boolean().default(false),
  })
  .refine((v) => !v.repeat || (v.weekdays.length > 0 && !!v.repeatUntil && v.repeatUntil >= v.date), { message: "Choose weekdays and an end date after the start date", path: ["repeatUntil"] });
export type SessionFormValues = z.input<typeof sessionSchema>;

export const cancelSessionSchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["WEATHER", "HOLIDAY", "VENUE", "COACH_UNAVAILABLE", "OTHER"]),
  reason: requiredText("Reason", 300),
  scope: z.enum(["THIS", "FOLLOWING"]).default("THIS"),
});

export const rescheduleSchema = z.object({
  sessionId: z.string().min(1),
  date: dateString(),
  startTime: timeString,
  durationMinutes: z.coerce.number().int().min(15).max(480),
  venueId: optionalId,
  coachId: optionalId,
  allowConflicts: z.boolean().default(false),
});

export const attendanceSchema = z.object({
  sessionId: z.string().min(1),
  entries: z
    .array(
      z.object({
        playerId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "INJURED"]),
        note: z.string().max(300).optional().nullable(),
        expectedVersion: z.number().int().nullable().optional(),
      }),
    )
    .min(1)
    .max(300),
  reason: optionalText(300),
  force: z.boolean().default(false),
  method: z.enum(["MANUAL", "BULK", "QR"]).default("MANUAL"),
});

export const extraPlayerSchema = z.object({ sessionId: z.string().min(1), playerId: z.string().min(1), reason: z.enum(["MAKEUP", "TRIAL", "GUEST"]) });

export const holidaySchema = z.object({ branchId: optionalId, date: dateString(), name: requiredText("Name", 120), cancelSessions: z.boolean().default(true) });

export const settingsSchema = z.object({
  name: requiredText("Academy name", 120),
  shortName: requiredText("Short name", 40),
  primaryColor: hexColor,
  accentColor: hexColor,
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  address: optionalText(300),
  website: optionalText(200),
  timezone: requiredText("Time zone", 60),
  currency: z.literal("NGN"),
  academyIdPrefix: z.string().trim().regex(/^[A-Z]{2,6}$/, "2–6 capital letters"),
  defaultSessionMinutes: z.coerce.number().int().min(15).max(480),
  defaultMonthlyFeeNaira: nairaAmount,
  defaultSessionsPerPackage: z.coerce.number().int().min(1).max(100),
  registrationFeeNaira: nairaAmount,
  creditDeductStatuses: z.array(z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "INJURED"])),
  allowAttendanceWithoutCredit: z.boolean(),
  paymentInstructions: optionalText(2000),
  ageCutoffMonth: z.coerce.number().int().min(1).max(12),
  ageCutoffDay: z.coerce.number().int().min(1).max(31),
  mfaRequiredForPrivileged: z.boolean(),
  dataRetentionMonths: z.coerce.number().int().min(12).max(240),
});
export type SettingsFormValues = z.input<typeof settingsSchema>;

export const branchSchema = z.object({
  id: optionalId,
  name: requiredText("Name", 120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "2–10 letters or digits"),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: optionalPhone,
  email: optionalEmail,
  isActive: z.boolean(),
});

export const venueSchema = z.object({
  id: optionalId,
  branchId: z.string().min(1, "Choose a branch"),
  name: requiredText("Name", 120),
  address: optionalText(300),
  surface: optionalText(60),
  capacity: optionalInt(1, 10000),
  isActive: z.boolean(),
});

export const seasonSchema = z
  .object({ id: optionalId, name: requiredText("Name", 60), startDate: dateString("Start"), endDate: dateString("End"), isCurrent: z.boolean() })
  .refine((v) => v.endDate > v.startDate, { message: "End must be after start", path: ["endDate"] });

export const userSchema = z.object({
  id: optionalId,
  name: requiredText("Name", 120),
  email,
  phone: optionalPhone,
  isActive: z.boolean(),
  roles: z.array(z.object({ roleId: z.string().min(1), branchId: optionalId })).min(1, "Assign at least one role"),
});

export const rolePermissionsSchema = z.object({ roleId: z.string().min(1), permissionKeys: z.array(z.string()) });
