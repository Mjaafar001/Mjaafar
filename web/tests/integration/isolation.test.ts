import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildCurrentUser } from "@/lib/auth/current-user";
import { playerScope, sessionScope } from "@/lib/services/scope";
import { canAccessBranch } from "@/lib/rbac/authorize";
import { rateLimit } from "@/lib/auth/rate-limit";
import { makeBranch, makeGroup, makePlayer, makeSession, makeStaff, makeUser } from "../helpers/factory";

const ctx = (id: string) => buildCurrentUser(id, { id: "test-session", mfaVerified: true });
let A: string, B: string, gA1: string, gA2: string, gB: string;

beforeAll(async () => {
  A = (await makeBranch()).id;
  B = (await makeBranch()).id;
  gA1 = (await makeGroup(A)).id;
  gA2 = (await makeGroup(A)).id;
  gB = (await makeGroup(B)).id;
});

async function visiblePlayerIds(userId: string, among: string[]) {
  const user = (await ctx(userId))!;
  return (await db.player.findMany({ where: { AND: [playerScope(user), { id: { in: among } }] }, select: { id: true } })).map((p) => p.id).sort();
}

describe("data isolation", () => {
  it("coaches only see players in their assigned age groups (or where they are primary coach)", async () => {
    const coachUser = await makeUser("COACH", A);
    const staff = await makeStaff(A, coachUser.id, [gA1]);
    const mine = await makePlayer(A, gA1);
    const other = await makePlayer(A, gA2);
    const primary = await makePlayer(A, gA2);
    await db.player.update({ where: { id: primary.id }, data: { primaryCoachId: staff.id } });
    const otherBranch = await makePlayer(B, gB);
    expect(await visiblePlayerIds(coachUser.id, [mine.id, other.id, primary.id, otherBranch.id])).toEqual([mine.id, primary.id].sort());

    const s1 = await makeSession(A, gA1);
    const s2 = await makeSession(A, gA2);
    const user = (await ctx(coachUser.id))!;
    const sessions = await db.trainingSession.findMany({ where: { AND: [sessionScope(user), { id: { in: [s1.id, s2.id] } }] } });
    expect(sessions.map((s) => s.id)).toEqual([s1.id]);
  });

  it("branch administrators only see their branch; the president sees all", async () => {
    const admin = await makeUser("ADMIN", A);
    const president = await makeUser("SUPER_ADMIN", null);
    const pa = await makePlayer(A, gA1);
    const pb = await makePlayer(B, gB);
    expect(await visiblePlayerIds(admin.id, [pa.id, pb.id])).toEqual([pa.id]);
    expect(await visiblePlayerIds(president.id, [pa.id, pb.id])).toEqual([pa.id, pb.id].sort());
    const adminCtx = (await ctx(admin.id))!;
    expect(canAccessBranch(adminCtx, A)).toBe(true);
    expect(canAccessBranch(adminCtx, B)).toBe(false);
  });

  it("parents only see their linked children, including siblings", async () => {
    const parentUser = await makeUser("PARENT", A);
    const guardian = await db.guardian.create({ data: { firstName: "P", lastName: "Arent", phone: `0809${Date.now() % 10000000}`, userId: parentUser.id } });
    const kid1 = await makePlayer(A, gA1);
    const kid2 = await makePlayer(A, gA2);
    const stranger = await makePlayer(A, gA1);
    await db.playerGuardian.createMany({ data: [{ playerId: kid1.id, guardianId: guardian.id, relationship: "Mother" }, { playerId: kid2.id, guardianId: guardian.id, relationship: "Mother" }] });
    expect(await visiblePlayerIds(parentUser.id, [kid1.id, kid2.id, stranger.id])).toEqual([kid1.id, kid2.id].sort());
    const u = (await ctx(parentUser.id))!;
    expect(u.permissions.has("players.view")).toBe(false);
    expect(u.permissions.has("medical.view")).toBe(false);
  });

  it("staff lose access immediately when a role is removed or the account is deactivated", async () => {
    const u = await makeUser("HEAD_COACH", A);
    expect((await ctx(u.id))!.permissions.has("players.view")).toBe(true);
    await db.userRole.deleteMany({ where: { userId: u.id } });
    const after = (await ctx(u.id))!;
    expect(after.permissions.size).toBe(0);
    expect(await visiblePlayerIds(u.id, [(await makePlayer(A, gA1)).id])).toEqual([]);
    await db.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await ctx(u.id)).toBeNull();
  });

  it("players moving branch become invisible to the old branch's staff", async () => {
    const admin = await makeUser("ADMIN", A);
    const p = await makePlayer(A, gA1);
    expect(await visiblePlayerIds(admin.id, [p.id])).toEqual([p.id]);
    await db.player.update({ where: { id: p.id }, data: { branchId: B, ageGroupId: gB } });
    expect(await visiblePlayerIds(admin.id, [p.id])).toEqual([]);
  });

  it("rate limiter blocks after the limit within a window", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit(key, 3, 60)).ok);
    expect(results).toEqual([true, true, true, false]);
  });
});
