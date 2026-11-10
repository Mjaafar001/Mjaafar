import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordAttendance, reverseSessionCredits } from "@/lib/services/attendance";
import { balance, makeBranch, makeGroup, makePlayer, makeSession, makeUser } from "../helpers/factory";

let branchId: string, groupId: string, actorId: string;

beforeAll(async () => {
  const b = await makeBranch();
  branchId = b.id;
  groupId = (await makeGroup(branchId)).id;
  actorId = (await makeUser("COACH", branchId)).id;
});

describe("attendance and session credits", () => {
  it("deducts exactly one credit for present and reverses when changed to absent", async () => {
    const p = await makePlayer(branchId, groupId, 12);
    const s = await makeSession(branchId, groupId);
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
    expect(await balance(p.id)).toBe(11);
    // Saving the same status again changes nothing.
    const again = await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
    expect(again.unchanged).toBe(1);
    expect(await balance(p.id)).toBe(11);
    // PRESENT → LATE: both deduct, so no change.
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "LATE" }], actorId, method: "MANUAL" });
    expect(await balance(p.id)).toBe(11);
    // LATE → ABSENT: reversal.
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "ABSENT" }], actorId, method: "MANUAL" });
    expect(await balance(p.id)).toBe(12);
    // ABSENT → PRESENT: deducted again (net one deduction).
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
    expect(await balance(p.id)).toBe(11);
    const history = await db.attendanceHistory.count({ where: { attendance: { sessionId: s.id, playerId: p.id } } });
    expect(history).toBe(4); // create, →LATE, →ABSENT, →PRESENT
  });

  it("two coaches marking the same player simultaneously produce one record and one deduction", async () => {
    const p = await makePlayer(branchId, groupId, 5);
    const s = await makeSession(branchId, groupId);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: i % 2 ? "LATE" : "PRESENT" }], actorId, method: "MANUAL" })),
    );
    expect(results.every(Boolean)).toBe(true);
    expect(await db.attendance.count({ where: { sessionId: s.id, playerId: p.id } })).toBe(1);
    expect(await balance(p.id)).toBe(4);
  });

  it("reports a conflict instead of overwriting another coach's newer save", async () => {
    const p = await makePlayer(branchId, groupId, 5);
    const s = await makeSession(branchId, groupId);
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
    // Coach B loaded version 1 and saves → version 2
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "EXCUSED", expectedVersion: 1 }], actorId, method: "MANUAL" });
    // Coach A still holds version 1 → conflict, nothing written
    const out = await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "ABSENT", expectedVersion: 1 }], actorId, method: "MANUAL" });
    expect(out.conflicts).toEqual([{ playerId: p.id, currentStatus: "EXCUSED", currentVersion: 2 }]);
    expect((await db.attendance.findFirstOrThrow({ where: { sessionId: s.id, playerId: p.id } })).status).toBe("EXCUSED");
    // Force overrides deliberately
    const forced = await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "ABSENT", expectedVersion: 1 }], actorId, method: "MANUAL", force: true });
    expect(forced.saved).toBe(1);
  });

  it("returns credits when a session is cancelled, and refuses attendance afterwards", async () => {
    const p1 = await makePlayer(branchId, groupId, 3);
    const p2 = await makePlayer(branchId, groupId, 3);
    const s = await makeSession(branchId, groupId);
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p1.id, status: "PRESENT" }, { playerId: p2.id, status: "ABSENT" }], actorId, method: "BULK" });
    expect(await balance(p1.id)).toBe(2);
    const reversed = await db.$transaction(async (tx) => {
      await tx.trainingSession.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
      return reverseSessionCredits(tx, s.id, actorId);
    });
    expect(reversed).toBe(1);
    expect(await balance(p1.id)).toBe(3);
    expect(await balance(p2.id)).toBe(3);
    // Running the reversal again (retry) does not double-refund.
    await db.$transaction((tx) => reverseSessionCredits(tx, s.id, actorId));
    expect(await balance(p1.id)).toBe(3);
    await expect(recordAttendance({ sessionId: s.id, entries: [{ playerId: p1.id, status: "PRESENT" }], actorId, method: "MANUAL" })).rejects.toThrow("SESSION_CANCELLED");
  });

  it("does not deduct for sessions that don't count toward credits", async () => {
    const p = await makePlayer(branchId, groupId, 2);
    const s = await makeSession(branchId, groupId);
    await db.trainingSession.update({ where: { id: s.id }, data: { countsTowardCredits: false } });
    await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
    expect(await balance(p.id)).toBe(2);
  });

  it("blocks players with no credits when the academy policy requires it", async () => {
    await db.academySettings.update({ where: { id: "default" }, data: { allowAttendanceWithoutCredit: false } });
    try {
      const p = await makePlayer(branchId, groupId, 0);
      const s = await makeSession(branchId, groupId);
      const out = await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "PRESENT" }], actorId, method: "MANUAL" });
      expect(out.blocked).toHaveLength(1);
      expect(await db.attendance.count({ where: { sessionId: s.id } })).toBe(0);
      // Absent can still be recorded (no deduction needed).
      const absent = await recordAttendance({ sessionId: s.id, entries: [{ playerId: p.id, status: "ABSENT" }], actorId, method: "MANUAL" });
      expect(absent.saved).toBe(1);
    } finally {
      await db.academySettings.update({ where: { id: "default" }, data: { allowAttendanceWithoutCredit: true } });
    }
  });

  it("enforces ledger idempotency keys at the database level", async () => {
    const p = await makePlayer(branchId, groupId, 0);
    await db.sessionCreditEntry.create({ data: { playerId: p.id, type: "MANUAL_ADJUSTMENT", delta: 1, idempotencyKey: `dup:${p.id}` } });
    await expect(db.sessionCreditEntry.create({ data: { playerId: p.id, type: "MANUAL_ADJUSTMENT", delta: 1, idempotencyKey: `dup:${p.id}` } })).rejects.toThrow();
    expect(await balance(p.id)).toBe(1);
  });
});
