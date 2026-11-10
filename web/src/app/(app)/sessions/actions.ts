"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authorize, assertBranch, AuthorizationError, can } from "@/lib/rbac/authorize";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action";
import { expandRecurrence } from "@/lib/services/schedule-rules";
import { conflictsFor, describeConflict } from "@/lib/services/sessions";
import { recordAttendance, reverseSessionCredits } from "@/lib/services/attendance";
import { sessionScope, playerScope } from "@/lib/services/scope";
import { localDayBounds, localToUtc, parseDateOnly } from "@/lib/dates";
import { formatDateTime } from "@/lib/utils";
import { attendanceSchema, cancelSessionSchema, extraPlayerSchema, holidaySchema, rescheduleSchema, sessionSchema } from "@/lib/validators/operations";
import type { CurrentUser } from "@/lib/auth/current-user";

async function loadSessionFor(user: CurrentUser, id: string) {
  const s = await db.trainingSession.findFirst({ where: { id, ...sessionScope(user) } });
  if (!s) throw new AuthorizationError("Session not found or not accessible.");
  return s;
}

async function validateRefs(branchId: string, refs: { ageGroupId?: string; venueId?: string; coachId?: string }) {
  const [g, v, c] = await Promise.all([
    refs.ageGroupId ? db.ageGroup.findUnique({ where: { id: refs.ageGroupId } }) : null,
    refs.venueId ? db.venue.findUnique({ where: { id: refs.venueId } }) : null,
    refs.coachId ? db.staffProfile.findUnique({ where: { id: refs.coachId } }) : null,
  ]);
  if ((refs.ageGroupId && g?.branchId !== branchId) || (refs.venueId && v?.branchId !== branchId) || (refs.coachId && c?.branchId !== branchId)) {
    throw new UserFacingError("Age group, venue and coach must all belong to the selected branch.");
  }
}

function conflictResult(conflicts: Awaited<ReturnType<typeof conflictsFor>>): Extract<ActionResult, { ok: false }> {
  const lines = conflicts.slice(0, 8).map((c) => `${formatDateTime(c.candidateStart)} — ${describeConflict(c)}`);
  if (conflicts.length > 8) lines.push(`…and ${conflicts.length - 8} more`);
  return { ok: false, error: `${conflicts.length} scheduling conflict${conflicts.length === 1 ? "" : "s"} found.`, fieldErrors: { _conflicts: lines } };
}

export async function createSessions(input: unknown): Promise<ActionResult<{ id: string; count: number }>> {
  return runAction<typeof sessionSchema, { id: string; count: number }>(sessionSchema, input, async (d) => {
    const user = await authorize("sessions.manage");
    assertBranch(user, d.branchId);
    await validateRefs(d.branchId, d);
    if (!can(user, "players.view") && user.staffId && d.ageGroupId) {
      const assigned = await db.staffAgeGroup.count({ where: { staffId: user.staffId, ageGroupId: d.ageGroupId } });
      if (!assigned) throw new AuthorizationError("Coaches can only schedule sessions for their own age groups.");
    }

    const holidays = await db.holiday.findMany({ where: { OR: [{ branchId: null }, { branchId: d.branchId }] } });
    const skip = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const occurrences = d.repeat
      ? expandRecurrence({ weekdays: d.weekdays, intervalWeeks: d.intervalWeeks, startDate: d.date, endDate: d.repeatUntil!, startTime: d.startTime, durationMinutes: d.durationMinutes, skipDates: skip })
      : [{ date: d.date, startsAt: localToUtc(d.date, d.startTime), endsAt: new Date(localToUtc(d.date, d.startTime).getTime() + d.durationMinutes * 60000) }];
    if (occurrences.length === 0) throw new UserFacingError("No sessions fall on the chosen days (holidays are skipped).");

    const refs = { coachId: d.coachId ?? null, venueId: d.venueId ?? null, ageGroupId: d.ageGroupId ?? null };
    const conflicts = await conflictsFor(occurrences.map((o) => ({ ...o, ...refs })));
    if (conflicts.length && !d.allowConflicts) return conflictResult(conflicts);

    const result = await db.$transaction(async (tx) => {
      const rule = d.repeat
        ? await tx.recurrenceRule.create({ data: { branchId: d.branchId, title: d.title, ...refs, weekdays: d.weekdays, intervalWeeks: d.intervalWeeks, startDate: parseDateOnly(d.date), endDate: parseDateOnly(d.repeatUntil!), startTime: d.startTime, durationMinutes: d.durationMinutes, capacity: d.capacity ?? null, objectives: d.objectives ?? null, createdById: user.id } })
        : null;
      const base = { branchId: d.branchId, title: d.title, ...refs, capacity: d.capacity ?? null, objectives: d.objectives ?? null, notes: d.notes ?? null, countsTowardCredits: d.countsTowardCredits, recurrenceId: rule?.id ?? null, createdById: user.id };
      const first = await tx.trainingSession.create({ data: { ...base, startsAt: occurrences[0]!.startsAt, endsAt: occurrences[0]!.endsAt } });
      if (occurrences.length > 1) await tx.trainingSession.createMany({ data: occurrences.slice(1).map((o) => ({ ...base, startsAt: o.startsAt, endsAt: o.endsAt })) });
      await audit({ actorId: user.id, action: "session.create", entityType: "TrainingSession", entityId: first.id, branchId: d.branchId, summary: `${d.title}: ${occurrences.length} session(s)${conflicts.length ? ` (${conflicts.length} conflicts accepted)` : ""}` }, tx);
      return { id: first.id, count: occurrences.length };
    });
    revalidatePath("/calendar");
    return { ok: true, message: result.count > 1 ? `${result.count} sessions scheduled` : "Session scheduled", data: result };
  });
}

const updateSchema = z.object({
  sessionId: z.string(), title: z.string().trim().min(1).max(120), objectives: z.string().max(2000).optional(), notes: z.string().max(2000).optional(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(500)]).optional(), countsTowardCredits: z.boolean(),
});

export async function updateSessionDetails(input: unknown) {
  return runAction(updateSchema, input, async (d) => {
    const user = await authorize("sessions.manage");
    const s = await loadSessionFor(user, d.sessionId);
    const after = await db.trainingSession.update({ where: { id: s.id }, data: { title: d.title, objectives: d.objectives || null, notes: d.notes || null, capacity: d.capacity === "" || d.capacity === undefined ? null : d.capacity, countsTowardCredits: d.countsTowardCredits } });
    await audit({ actorId: user.id, action: "session.update", entityType: "TrainingSession", entityId: s.id, branchId: s.branchId, before: s, after });
    revalidatePath(`/sessions/${s.id}`);
    return { ok: true, message: "Session updated" };
  });
}

export async function rescheduleSession(input: unknown) {
  return runAction(rescheduleSchema, input, async (d) => {
    const user = await authorize("sessions.manage");
    const s = await loadSessionFor(user, d.sessionId);
    if (s.status === "CANCELLED") throw new UserFacingError("Cancelled sessions can't be rescheduled.");
    if (s.status === "COMPLETED") throw new UserFacingError("This session has already taken place.");
    await validateRefs(s.branchId, d);
    const startsAt = localToUtc(d.date, d.startTime);
    const endsAt = new Date(startsAt.getTime() + d.durationMinutes * 60000);
    const refs = { coachId: d.coachId ?? null, venueId: d.venueId ?? null, ageGroupId: s.ageGroupId };
    const conflicts = await conflictsFor([{ id: s.id, startsAt, endsAt, ...refs }]);
    if (conflicts.length && !d.allowConflicts) return conflictResult(conflicts);
    const after = await db.trainingSession.update({ where: { id: s.id }, data: { startsAt, endsAt, coachId: refs.coachId, venueId: refs.venueId, status: "SCHEDULED" } });
    await audit({ actorId: user.id, action: "session.reschedule", entityType: "TrainingSession", entityId: s.id, branchId: s.branchId, summary: `${formatDateTime(s.startsAt)} → ${formatDateTime(startsAt)}`, before: s, after });
    revalidatePath(`/sessions/${s.id}`);
    revalidatePath("/calendar");
    return { ok: true, message: "Session rescheduled" };
  });
}

export async function cancelSession(input: unknown) {
  return runAction(cancelSessionSchema, input, async (d) => {
    const user = await authorize("sessions.manage");
    const s = await loadSessionFor(user, d.sessionId);
    if (s.status === "CANCELLED") throw new UserFacingError("Already cancelled.");
    const targets = d.scope === "FOLLOWING" && s.recurrenceId
      ? await db.trainingSession.findMany({ where: { recurrenceId: s.recurrenceId, startsAt: { gte: s.startsAt }, status: { not: "CANCELLED" } } })
      : [s];
    const reversed = await db.$transaction(async (tx) => {
      let total = 0;
      for (const t of targets) {
        await tx.trainingSession.update({ where: { id: t.id }, data: { status: "CANCELLED", cancellationType: d.type, cancellationReason: d.reason } });
        total += await reverseSessionCredits(tx, t.id, user.id);
      }
      await audit({ actorId: user.id, action: "session.cancel", entityType: "TrainingSession", entityId: s.id, branchId: s.branchId, summary: `${targets.length} session(s) cancelled (${d.type.toLowerCase()}): ${d.reason}${total ? `; ${total} credits returned` : ""}` }, tx);
      return total;
    }, { timeout: 30000 });
    revalidatePath("/calendar");
    revalidatePath(`/sessions/${s.id}`);
    return { ok: true, message: `${targets.length} session${targets.length === 1 ? "" : "s"} cancelled${reversed ? `, ${reversed} credits returned` : ""}. Parent notifications are sent from Communication (Phase 4).` };
  });
}

export async function addExtraPlayer(input: unknown) {
  return runAction(extraPlayerSchema, input, async (d) => {
    const user = await authorize("sessions.manage", "attendance.record");
    const s = await loadSessionFor(user, d.sessionId);
    const p = await db.player.findFirst({ where: { id: d.playerId, branchId: s.branchId, ...playerScope(user) } });
    if (!p) throw new UserFacingError("Player not found in this branch.");
    if (s.capacity != null) {
      const [members, extras] = await Promise.all([
        s.ageGroupId ? db.player.count({ where: { ageGroupId: s.ageGroupId, status: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null } }) : 0,
        db.sessionPlayer.count({ where: { sessionId: s.id } }),
      ]);
      if (members + extras >= s.capacity) throw new UserFacingError("This session is at capacity.");
    }
    await db.sessionPlayer.upsert({ where: { sessionId_playerId: { sessionId: s.id, playerId: p.id } }, update: { reason: d.reason }, create: { sessionId: s.id, playerId: p.id, reason: d.reason, approvedById: user.id } });
    await audit({ actorId: user.id, action: "session.add_player", entityType: "TrainingSession", entityId: s.id, branchId: s.branchId, summary: `${p.firstName} ${p.lastName} (${d.reason.toLowerCase()})` });
    revalidatePath(`/sessions/${s.id}`);
    return { ok: true, message: `${p.firstName} added as ${d.reason.toLowerCase()}` };
  });
}

/** Saves attendance. Past-day changes need attendance.correct and a reason (audited). */
export async function saveAttendance(input: unknown) {
  return runAction(attendanceSchema, input, async (d) => {
    const user = await authorize("attendance.record", "attendance.correct");
    const s = await loadSessionFor(user, d.sessionId);
    if (s.status === "CANCELLED") throw new UserFacingError("Attendance can't be taken for a cancelled session.");
    const today = localDayBounds();
    if (s.startsAt >= today.end) throw new UserFacingError("Attendance can be taken from the day of the session.");
    const isCorrection = s.startsAt < today.start;
    if (isCorrection) {
      if (!can(user, "attendance.correct")) throw new AuthorizationError("Only administrators can change attendance after the session day.");
      if (!d.reason || d.reason.length < 3) throw new UserFacingError("Give a reason for correcting past attendance.");
    } else if (!can(user, "attendance.record")) throw new AuthorizationError();

    // Only roster members (age group + approved extras) may be marked.
    const allowed = new Set([
      ...(s.ageGroupId ? (await db.player.findMany({ where: { ageGroupId: s.ageGroupId, branchId: s.branchId }, select: { id: true } })).map((p) => p.id) : []),
      ...(await db.sessionPlayer.findMany({ where: { sessionId: s.id }, select: { playerId: true } })).map((p) => p.playerId),
      ...(await db.attendance.findMany({ where: { sessionId: s.id }, select: { playerId: true } })).map((p) => p.playerId),
    ]);
    if (d.entries.some((e) => !allowed.has(e.playerId))) throw new UserFacingError("Some players are not on this session's roster.");

    const outcome = await recordAttendance({ sessionId: s.id, entries: d.entries, actorId: user.id, method: d.method, reason: isCorrection ? d.reason : undefined, force: d.force });
    await audit({ actorId: user.id, action: isCorrection ? "attendance.correction_batch" : "attendance.record", entityType: "TrainingSession", entityId: s.id, branchId: s.branchId, summary: `${outcome.saved} saved, ${outcome.unchanged} unchanged, ${outcome.conflicts.length} conflicts, ${outcome.blocked.length} blocked${isCorrection ? ` — ${d.reason}` : ""}` });
    revalidatePath(`/sessions/${s.id}`);
    return { ok: true, message: `Attendance saved (${outcome.saved} updated)`, data: outcome };
  });
}

export async function addHoliday(input: unknown) {
  return runAction(holidaySchema, input, async (d) => {
    const user = await authorize("sessions.manage");
    if (d.branchId) assertBranch(user, d.branchId);
    else if (user.branchIds !== null) throw new AuthorizationError("Only academy-wide administrators can add holidays for all branches.");
    const date = parseDateOnly(d.date);
    const { start, end } = localDayBounds(localToUtc(d.date, "12:00"));
    const cancelled = await db.$transaction(async (tx) => {
      await tx.holiday.create({ data: { date, name: d.name, branchId: d.branchId ?? null } });
      if (!d.cancelSessions) return 0;
      const sessions = await tx.trainingSession.findMany({ where: { startsAt: { gte: start, lt: end }, status: "SCHEDULED", ...(d.branchId ? { branchId: d.branchId } : user.branchIds ? { branchId: { in: user.branchIds } } : {}) } });
      for (const s of sessions) {
        await tx.trainingSession.update({ where: { id: s.id }, data: { status: "CANCELLED", cancellationType: "HOLIDAY", cancellationReason: d.name } });
        await reverseSessionCredits(tx, s.id, user.id);
      }
      await audit({ actorId: user.id, action: "holiday.add", entityType: "Holiday", branchId: d.branchId ?? null, summary: `${d.name} (${d.date}) — ${sessions.length} sessions cancelled` }, tx);
      return sessions.length;
    });
    revalidatePath("/calendar");
    return { ok: true, message: `Holiday added${cancelled ? `; ${cancelled} sessions cancelled` : ""}` };
  });
}
