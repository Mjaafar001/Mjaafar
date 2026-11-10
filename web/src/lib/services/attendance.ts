import "server-only";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { shouldDeduct, creditDelta } from "./credit-rules";
import type { AttendanceMethod, AttendanceStatus } from "@/generated/prisma/enums";

export type AttendanceEntry = { playerId: string; status: AttendanceStatus; note?: string | null; expectedVersion?: number | null };
export type AttendanceOutcome = {
  saved: number;
  unchanged: number;
  conflicts: { playerId: string; currentStatus: AttendanceStatus; currentVersion: number }[];
  blocked: { playerId: string; reason: string }[];
};

/** Players expected at a session: active/trial members of the age group plus approved extra players. */
export async function sessionRoster(session: { id: string; ageGroupId: string | null; branchId: string }, client: Tx | typeof db = db) {
  const [members, extras] = await Promise.all([
    session.ageGroupId
      ? client.player.findMany({
          where: { ageGroupId: session.ageGroupId, branchId: session.branchId, status: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        })
      : Promise.resolve([]),
    client.sessionPlayer.findMany({ where: { sessionId: session.id }, include: { player: true } }),
  ]);
  const seen = new Set(members.map((m) => m.id));
  return [
    ...members.map((p) => ({ player: p, reason: null as string | null })),
    ...extras.filter((e) => !seen.has(e.playerId)).map((e) => ({ player: e.player, reason: e.reason as string })),
  ];
}

/**
 * Records attendance for many players in one session.
 *
 * Guarantees:
 *  - One Attendance row per (session, player): unique index + per-pair advisory lock.
 *  - Optimistic concurrency: if the caller passes expectedVersion and the row changed since
 *    it was loaded (another coach saved first), the entry is reported as a conflict, not overwritten.
 *  - Credits: at most one net deduction per attendance row. Changing to a non-deducting status
 *    posts a reversal. Ledger idempotency keys make retries safe.
 */
export async function recordAttendance(input: {
  sessionId: string;
  entries: AttendanceEntry[];
  actorId: string;
  method: AttendanceMethod;
  reason?: string;
  force?: boolean;
}): Promise<AttendanceOutcome> {
  const outcome: AttendanceOutcome = { saved: 0, unchanged: 0, conflicts: [], blocked: [] };
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });

  await db.$transaction(
    async (tx) => {
      const session = await tx.trainingSession.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.status === "CANCELLED") throw new Error("SESSION_CANCELLED");

      for (const entry of input.entries) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.id + ":" + entry.playerId}, 0))`;
        const existing = await tx.attendance.findUnique({ where: { sessionId_playerId: { sessionId: session.id, playerId: entry.playerId } } });

        if (existing && !input.force && entry.expectedVersion != null && existing.version !== entry.expectedVersion) {
          outcome.conflicts.push({ playerId: entry.playerId, currentStatus: existing.status, currentVersion: existing.version });
          continue;
        }
        if (existing && existing.status === entry.status && (existing.note ?? "") === (entry.note ?? "")) {
          outcome.unchanged++;
          continue;
        }

        const deduct = shouldDeduct(entry.status, session, { deductStatuses: settings.creditDeductStatuses });
        const netPosted = existing
          ? (await tx.sessionCreditEntry.aggregate({ where: { attendanceId: existing.id }, _sum: { delta: true } }))._sum.delta ?? 0
          : 0;
        const delta = creditDelta(netPosted, deduct);

        if (delta === -1 && !settings.allowAttendanceWithoutCredit) {
          const bal = (await tx.sessionCreditEntry.aggregate({ where: { playerId: entry.playerId }, _sum: { delta: true } }))._sum.delta ?? 0;
          if (bal <= 0) {
            outcome.blocked.push({ playerId: entry.playerId, reason: "No session credits remaining" });
            continue;
          }
        }

        const row = existing
          ? await tx.attendance.update({
              where: { id: existing.id },
              data: { status: entry.status, note: entry.note ?? null, method: input.method, recordedById: input.actorId, version: { increment: 1 } },
            })
          : await tx.attendance.create({
              data: {
                sessionId: session.id,
                playerId: entry.playerId,
                status: entry.status,
                note: entry.note ?? null,
                method: input.method,
                recordedById: input.actorId,
                checkInAt: entry.status === "PRESENT" || entry.status === "LATE" ? new Date() : null,
              },
            });

        if (!existing || existing.status !== entry.status) {
          await tx.attendanceHistory.create({
            data: { attendanceId: row.id, fromStatus: existing?.status ?? null, toStatus: entry.status, changedById: input.actorId, reason: input.reason },
          });
        }

        if (delta !== 0) {
          const seq = await tx.sessionCreditEntry.count({ where: { attendanceId: row.id } });
          await tx.sessionCreditEntry.create({
            data: {
              playerId: entry.playerId,
              attendanceId: row.id,
              delta,
              type: delta < 0 ? "ATTENDANCE_DEDUCTION" : "ATTENDANCE_REVERSAL",
              reason: delta < 0 ? `Attended ${session.title}` : `Attendance changed to ${entry.status.toLowerCase()}`,
              idempotencyKey: `att:${row.id}:${seq + 1}`,
              createdById: input.actorId,
            },
          });
        }

        if (existing && input.reason) {
          await audit(
            { actorId: input.actorId, action: "attendance.correct", entityType: "Attendance", entityId: row.id, branchId: session.branchId, summary: input.reason, before: { status: existing.status }, after: { status: entry.status } },
            tx,
          );
        }
        outcome.saved++;
      }

      // A session with recorded attendance in the past is considered completed.
      if (outcome.saved > 0 && session.status === "SCHEDULED" && session.startsAt <= new Date()) {
        await tx.trainingSession.update({ where: { id: session.id }, data: { status: "COMPLETED" } });
      }
    },
    { timeout: 30000 },
  );
  return outcome;
}

/** Reverses every outstanding credit deduction for a session (used when it is cancelled). */
export async function reverseSessionCredits(tx: Tx, sessionId: string, actorId: string) {
  const rows = await tx.attendance.findMany({ where: { sessionId }, select: { id: true, playerId: true } });
  let reversed = 0;
  for (const a of rows) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId + ":" + a.playerId}, 0))`;
    const net = (await tx.sessionCreditEntry.aggregate({ where: { attendanceId: a.id }, _sum: { delta: true } }))._sum.delta ?? 0;
    if (net < 0) {
      const seq = await tx.sessionCreditEntry.count({ where: { attendanceId: a.id } });
      await tx.sessionCreditEntry.create({
        data: { playerId: a.playerId, attendanceId: a.id, delta: -net, type: "ATTENDANCE_REVERSAL", reason: "Session cancelled", idempotencyKey: `att:${a.id}:${seq + 1}`, createdById: actorId },
      });
      reversed++;
    }
  }
  return reversed;
}
