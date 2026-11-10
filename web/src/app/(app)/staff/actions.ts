"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authorize, assertBranch } from "@/lib/rbac/authorize";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action";
import { parseDateOnly } from "@/lib/dates";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { availabilitySchema, certificationSchema, staffSchema } from "@/lib/validators/operations";

const ROLE_FOR_TYPE: Record<string, string> = { HEAD_COACH: "HEAD_COACH", COACH: "COACH", ASSISTANT_COACH: "COACH", GOALKEEPER_COACH: "COACH", FITNESS_COACH: "COACH", ADMINISTRATOR: "ADMIN", ACCOUNTANT: "ACCOUNTANT" };

export async function saveStaff(input: unknown): Promise<ActionResult<{ id: string; link?: string }>> {
  return runAction(staffSchema, input, async ({ id, ageGroupIds, createLogin, ...d }) => {
    const user = await authorize("staff.manage");
    assertBranch(user, d.branchId);
    const groups = await db.ageGroup.findMany({ where: { id: { in: ageGroupIds } } });
    if (groups.some((g) => g.branchId !== d.branchId)) throw new UserFacingError("Assigned age groups must belong to the staff member's branch.");
    const data = {
      ...d, email: d.email ?? null, phone: d.phone ?? null, jobTitle: d.jobTitle ?? null, qualifications: d.qualifications ?? null, bio: d.bio ?? null,
      emergencyContactName: d.emergencyContactName ?? null, emergencyContactPhone: d.emergencyContactPhone ?? null, startDate: d.startDate ? parseDateOnly(d.startDate) : null,
    };
    const result = await db.$transaction(async (tx) => {
      const before = id ? await tx.staffProfile.findUnique({ where: { id } }) : null;
      if (before) assertBranch(user, before.branchId);
      const s = id ? await tx.staffProfile.update({ where: { id }, data }) : await tx.staffProfile.create({ data });
      await tx.staffAgeGroup.deleteMany({ where: { staffId: s.id } });
      if (ageGroupIds.length) await tx.staffAgeGroup.createMany({ data: ageGroupIds.map((ageGroupId) => ({ staffId: s.id, ageGroupId })) });

      let link: string | undefined;
      if (createLogin && !s.userId) {
        if (!s.email) throw new UserFacingError("An email address is required to create a login.");
        if (!user.permissions.has("users.manage")) throw new UserFacingError("Creating logins requires user-management permission.");
        const roleKey = ROLE_FOR_TYPE[s.staffType] ?? "COACH";
        const role = await tx.role.findUniqueOrThrow({ where: { key: roleKey } });
        if (role.rank >= user.maxRank && user.maxRank < 100) throw new UserFacingError(`You can't grant the ${role.name} role.`);
        const existing = await tx.user.findUnique({ where: { email: s.email } });
        if (existing && (await tx.staffProfile.findUnique({ where: { userId: existing.id } }))) throw new UserFacingError("That email already belongs to another staff login.");
        const u = existing ?? (await tx.user.create({ data: { email: s.email, name: `${s.firstName} ${s.lastName}`, phone: s.phone } }));
        await tx.userRole.create({ data: { userId: u.id, roleId: role.id, branchId: s.branchId } });
        await tx.staffProfile.update({ where: { id: s.id }, data: { userId: u.id } });
        if (!u.passwordHash) {
          const token = randomToken(32);
          await tx.authToken.create({ data: { userId: u.id, type: "PASSWORD_SETUP", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
          link = `${env.appUrl}/setup-password?token=${token}`;
        }
      }
      await audit({ actorId: user.id, action: id ? "staff.update" : "staff.create", entityType: "StaffProfile", entityId: s.id, branchId: s.branchId, before, after: { ...s, ageGroupIds } }, tx);
      return { id: s.id, link };
    });
    revalidatePath("/staff");
    return { ok: true, message: id ? "Staff profile saved" : "Staff member added", data: result };
  });
}

export async function addCertification(input: unknown) {
  return runAction(certificationSchema, input, async (d) => {
    const user = await authorize("staff.manage");
    const s = await db.staffProfile.findUniqueOrThrow({ where: { id: d.staffId } });
    assertBranch(user, s.branchId);
    await db.certification.create({ data: { staffId: s.id, name: d.name, issuer: d.issuer ?? null, issuedAt: d.issuedAt ? parseDateOnly(d.issuedAt) : null, expiresAt: d.expiresAt ? parseDateOnly(d.expiresAt) : null } });
    await audit({ actorId: user.id, action: "staff.certification", entityType: "StaffProfile", entityId: s.id, branchId: s.branchId, summary: d.name });
    revalidatePath(`/staff/${s.id}`);
    return { ok: true, message: "Certification added" };
  });
}

export async function removeCertification(id: string) {
  return runAction(z.string(), id, async (cid) => {
    const user = await authorize("staff.manage");
    const c = await db.certification.findUniqueOrThrow({ where: { id: cid }, include: { staff: true } });
    assertBranch(user, c.staff.branchId);
    await db.certification.delete({ where: { id: cid } });
    await audit({ actorId: user.id, action: "staff.certification_removed", entityType: "StaffProfile", entityId: c.staffId, summary: c.name });
    revalidatePath(`/staff/${c.staffId}`);
    return { ok: true, message: "Removed" };
  });
}

export async function saveAvailability(input: unknown) {
  return runAction(availabilitySchema, input, async (d) => {
    const user = await authorize("staff.manage");
    const s = await db.staffProfile.findUniqueOrThrow({ where: { id: d.staffId } });
    assertBranch(user, s.branchId);
    if (d.slots.some((x) => x.endTime <= x.startTime)) throw new UserFacingError("Each slot must end after it starts.");
    await db.$transaction([db.staffAvailability.deleteMany({ where: { staffId: s.id } }), db.staffAvailability.createMany({ data: d.slots.map((x) => ({ staffId: s.id, ...x })) })]);
    await audit({ actorId: user.id, action: "staff.availability", entityType: "StaffProfile", entityId: s.id, branchId: s.branchId });
    revalidatePath(`/staff/${s.id}`);
    return { ok: true, message: "Work schedule saved" };
  });
}
