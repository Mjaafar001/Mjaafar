import { ageOn, cutoffDate } from "@/lib/dates";

export type AgeBand = { id: string; name: string; minAge: number | null; maxAgeExclusive: number | null; isActive: boolean; sortOrder?: number };

/** True when a player of `age` belongs in the band. */
export function fitsBand(age: number, band: Pick<AgeBand, "minAge" | "maxAgeExclusive">) {
  if (band.minAge != null && age < band.minAge) return false;
  if (band.maxAgeExclusive != null && age >= band.maxAgeExclusive) return false;
  return true;
}

/**
 * Suggests the youngest active age group a child qualifies for, using the age on the
 * academy's cutoff date (default 1 January). Returns null if no group fits.
 */
export function suggestAgeGroup<T extends AgeBand>(dob: Date, groups: T[], cutoff: { month: number; day: number }, ref = new Date()): T | null {
  const age = ageOn(dob, cutoffDate(cutoff.month, cutoff.day, ref));
  const candidates = groups
    .filter((g) => g.isActive && fitsBand(age, g))
    .sort((a, b) => (a.maxAgeExclusive ?? 99) - (b.maxAgeExclusive ?? 99) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return candidates[0] ?? null;
}
