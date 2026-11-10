import { z } from "zod";

export const optionalText = (max = 500) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v || undefined);
export const requiredText = (label: string, max = 120) => z.string().trim().min(1, `${label} is required`).max(max);
export const dateString = (label = "Date") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`);
export const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || undefined);
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
/** Nigerian phone numbers: 0803…, +234803…, 234803… (10–14 digits). */
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^\+?\d{10,14}$/.test(v), "Enter a valid phone number");
export const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => v === "" || /^\+?\d{10,14}$/.test(v), "Enter a valid phone number")
  .optional()
  .transform((v) => v || undefined);
export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
export const optionalEmail = z.string().trim().toLowerCase().email("Enter a valid email address").max(200).optional().or(z.literal("")).transform((v) => v || undefined);
export const optionalInt = (min = 0, max = 100000) =>
  z.union([z.literal(""), z.coerce.number().int().min(min).max(max)]).optional().transform((v) => (v === "" || v === undefined ? undefined : v));
export const id = z.string().min(1).max(64);
export const optionalId = z.string().max(64).optional().or(z.literal("")).transform((v) => v || undefined);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #13804f");
export const nairaAmount = z.coerce.number().min(0, "Amount cannot be negative").max(100_000_000);
