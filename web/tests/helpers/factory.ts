import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";

const uid = () => randomToken(6).replace(/[^a-zA-Z0-9]/g, "x");

export async function makeBranch() {
  const code = `T${uid().slice(0, 6).toUpperCase()}`;
  return db.branch.create({ data: { name: `Branch ${code}`, code } });
}

export async function makeGroup(branchId: string, extra: { capacity?: number; maxAgeExclusive?: number; minAge?: number } = {}) {
  const c = uid();
  return db.ageGroup.create({ data: { branchId, name: `Group ${c}`, code: c.slice(0, 8), ...extra } });
}

export async function makePlayer(branchId: string, ageGroupId: string | null, credits = 0) {
  const p = await db.player.create({ data: { academyId: `TST-${uid()}`, branchId, ageGroupId, firstName: "Test", lastName: uid(), dateOfBirth: new Date(Date.UTC(2015, 0, 1)), gender: "MALE", status: "ACTIVE" } });
  if (credits) await db.sessionCreditEntry.create({ data: { playerId: p.id, type: "ALLOCATION", delta: credits, reason: "test", idempotencyKey: `test:${p.id}` } });
  return p;
}

export async function makeSession(branchId: string, ageGroupId: string | null, opts: { startsAt?: Date; coachId?: string; venueId?: string } = {}) {
  const startsAt = opts.startsAt ?? new Date(Date.now() - 60 * 60 * 1000);
  return db.trainingSession.create({ data: { branchId, ageGroupId, title: "Test session", startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60000), coachId: opts.coachId, venueId: opts.venueId } });
}

export async function makeUser(roleKey: string, branchId: string | null = null) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const u = await db.user.create({ data: { email: `${uid()}@test.example`, name: `User ${roleKey}` } });
  await db.userRole.create({ data: { userId: u.id, roleId: role.id, branchId } });
  return u;
}

export async function makeStaff(branchId: string, userId?: string, ageGroupIds: string[] = []) {
  return db.staffProfile.create({ data: { branchId, userId, firstName: "Coach", lastName: uid(), staffType: "COACH", ageGroups: { create: ageGroupIds.map((ageGroupId) => ({ ageGroupId })) } } });
}

export async function balance(playerId: string) {
  return (await db.sessionCreditEntry.aggregate({ where: { playerId }, _sum: { delta: true } }))._sum.delta ?? 0;
}
