import { addDaysToDateString, localToUtc, parseDateOnly } from "@/lib/dates";

export type Interval = { startsAt: Date; endsAt: Date };

export function overlaps(a: Interval, b: Interval) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export type RecurrenceInput = {
  weekdays: number[]; // 0=Sun … 6=Sat
  intervalWeeks: number;
  startDate: string; // YYYY-MM-DD local
  endDate: string; // inclusive
  startTime: string; // HH:mm local
  durationMinutes: number;
  skipDates?: Set<string>; // holidays (YYYY-MM-DD)
};

export const MAX_OCCURRENCES = 366;

/** Expands a weekly recurrence into concrete UTC intervals (local Lagos time). */
export function expandRecurrence(r: RecurrenceInput): (Interval & { date: string })[] {
  const out: (Interval & { date: string })[] = [];
  const start = parseDateOnly(r.startDate);
  const weekStart = addDaysToDateString(r.startDate, -start.getUTCDay()); // Sunday of first week
  for (let date = r.startDate; date <= r.endDate; date = addDaysToDateString(date, 1)) {
    const d = parseDateOnly(date);
    const weekIndex = Math.floor((d.getTime() - parseDateOnly(weekStart).getTime()) / (7 * 86400000));
    if (weekIndex % Math.max(1, r.intervalWeeks) !== 0) continue;
    if (!r.weekdays.includes(d.getUTCDay())) continue;
    if (r.skipDates?.has(date)) continue;
    const startsAt = localToUtc(date, r.startTime);
    out.push({ date, startsAt, endsAt: new Date(startsAt.getTime() + r.durationMinutes * 60000) });
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

export type SessionLike = Interval & { id: string; title: string; coachId: string | null; venueId: string | null; ageGroupId: string | null };
export type Conflict = { kind: "coach" | "venue" | "ageGroup"; withSessionId: string; withTitle: string; startsAt: Date };

/** Finds coach / venue / age-group double bookings between a candidate and existing sessions. */
export function detectConflicts(candidate: Omit<SessionLike, "id" | "title"> & { id?: string }, existing: SessionLike[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const s of existing) {
    if (s.id === candidate.id || !overlaps(candidate, s)) continue;
    const base = { withSessionId: s.id, withTitle: s.title, startsAt: s.startsAt };
    if (candidate.coachId && s.coachId === candidate.coachId) conflicts.push({ kind: "coach", ...base });
    if (candidate.venueId && s.venueId === candidate.venueId) conflicts.push({ kind: "venue", ...base });
    if (candidate.ageGroupId && s.ageGroupId === candidate.ageGroupId) conflicts.push({ kind: "ageGroup", ...base });
  }
  return conflicts;
}
