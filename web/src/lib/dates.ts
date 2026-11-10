import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "./utils";

/** Age in whole years on a given date. */
export function ageOn(dob: Date, on: Date = new Date()) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** The age-group cutoff date for the current season (e.g. 1 January this year). */
export function cutoffDate(month: number, day: number, ref: Date = new Date()) {
  return new Date(Date.UTC(ref.getUTCFullYear(), month - 1, day));
}

/** Parses "YYYY-MM-DD" as a UTC date (for @db.Date columns). */
export function parseDateOnly(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Converts a local Lagos date + "HH:mm" into a UTC instant. */
export function localToUtc(date: string, time: string, tz = TIMEZONE) {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function utcToLocalParts(d: Date, tz = TIMEZONE) {
  return { date: formatInTimeZone(d, tz, "yyyy-MM-dd"), time: formatInTimeZone(d, tz, "HH:mm") };
}

/** Start and end (UTC instants) of the local calendar day containing `d`. */
export function localDayBounds(d: Date = new Date(), tz = TIMEZONE) {
  const day = formatInTimeZone(d, tz, "yyyy-MM-dd");
  const start = fromZonedTime(`${day}T00:00:00`, tz);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), day };
}

export function localWeekday(d: Date, tz = TIMEZONE) {
  return toZonedTime(d, tz).getDay();
}

export function addDaysToDateString(date: string, days: number) {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Current instant offset by `days` (negative = past). Helper keeps time reads out of render bodies. */
export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400000);
}
