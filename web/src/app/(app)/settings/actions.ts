"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authorize, assertBranch, AuthorizationError } from "@/lib/rbac/authorize";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action";
import { nairaToKobo } from "@/lib/utils";
import { parseDateOnly } from "@/lib/dates";
import { randomToken, sha256 } from "@/lib/crypto";
import { revokeUserSessions } from "@/lib/auth/session";
import { storeFile } from "@/lib/storage";
import { ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { ageGroupSchema, branchSchema, mergeAgeGroupSchema, rolePermissionsSchema, seasonSchema, settingsSchema, userSchema, venueSchema } from "@/lib/validators/operations";
import { env } from "@/lib/env";

export async function updateSettings(input: unknown) {
  return runAction(settingsSchema, input, async (d) => {
    const user = await authorize("settings.manage");
    const before = await db.academySettings.findUnique({ where: { id: "default" } });
    const { defaultMonthlyFeeNaira, registrationFeeNaira, ...rest } = d;
    const after = await db.academySettings.update({
      where: { id: "default" },
      data: { ...rest, contactEmail: d.contactEmail ?? null, contactPhone: d.contactPhone ?? null, address: d.address ?? null, website: d.website ?? null, paymentInstructions: d.paymentInstructions ?? null, defaultMonthlyFeeKobo: nairaToKobo(defaultMonthlyFeeNaira), registrationFeeKobo: nairaToKobo(registrationFeeNaira) },
    });
    await audit({ actorId: user.id, action: "settings.update", entityType: "AcademySettings", entityId: "default", before, after });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved" };
  });
}

export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize("settings.manage");
    const file = formData.get("logo");
    if (!(file instanceof File)) return { ok: false, error: "Choose an image." };
    const stored = await storeFile("branding", file, ["image"]);
    if (!stored.ok) return { ok: false, error: stored.error };
    await db.academySettings.update({ where: { id: "default" }, data: { logoKey: stored.key } });
    await audit({ actorId: user.id, action: "settings.logo", entityType: "AcademySettings", entityId: "default" });
    revalidatePath("/", "layout");
    return { ok: true, message: "Logo updated" };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function saveBranch(input: unknown) {
  return runAction(branchSchema, input, async ({ id, ...d }) => {
    const user = await authorize("branches.manage");
    const data = { ...d, address: d.address ?? null, city: d.city ?? null, state: d.state ?? null, phone: d.phone ?? null, email: d.email ?? null };
    const before = id ? await db.branch.findUnique({ where: { id } }) : null;
    const row = id ? await db.branch.update({ where: { id }, data }) : await db.branch.create({ data });
    await audit({ actorId: user.id, action: id ? "branch.update" : "branch.create", entityType: "Branch", entityId: row.id, branchId: row.id, before, after: row });
    revalidatePath("/settings/branches");
    return { ok: true, message: id ? "Branch updated" : "Branch created" };
  });
}

export async function saveVenue(input: unknown) {
  return runAction(venueSchema, input, async ({ id, ...d }) => {
    const user = await authorize("settings.manage");
    assertBranch(user, d.branchId);
    const data = { ...d, address: d.address ?? null, surface: d.surface ?? null, capacity: d.capacity ?? null };
    const row = id ? await db.venue.update({ where: { id }, data }) : await db.venue.create({ data });
    await audit({ actorId: user.id, action: id ? "venue.update" : "venue.create", entityType: "Venue", entityId: row.id, branchId: row.branchId, after: row });
    revalidatePath("/settings/venues");
    return { ok: true, message: "Venue saved" };
  });
}

export async function saveSeason(input: unknown) {
  return runAction(seasonSchema, input, async ({ id, ...d }) => {
    const user = await authorize("settings.manage");
    const data = { name: d.name, startDate: parseDateOnly(d.startDate), endDate: parseDateOnly(d.endDate), isCurrent: d.isCurrent };
    const row = await db.$transaction(async (tx) => {
      if (d.isCurrent) await tx.season.updateMany({ data: { isCurrent: false } });
      return id ? tx.season.update({ where: { id }, data }) : tx.season.create({ data });
    });
    await audit({ actorId: user.id, action: "season.save", entityType: "Season", entityId: row.id, after: row });
    revalidatePath("/settings/venues");
    return { ok: true, message: "Season saved" };
  });
}

export async function saveAgeGroup(input: unknown) {
  return runAction(ageGroupSchema, input, async ({ id, ...d }) => {
    const user = await authorize("agegroups.manage");
    assertBranch(user, d.branchId);
    const data = { ...d, description: d.description ?? null, minAge: d.minAge ?? null, maxAgeExclusive: d.maxAgeExclusive ?? null, capacity: d.capacity ?? null };
    const before = id ? await db.ageGroup.findUnique({ where: { id } }) : null;
    if (before) assertBranch(user, before.branchId);
    if (before && before.branchId !== d.branchId && (await db.player.count({ where: { ageGroupId: id } })) > 0) {
      throw new UserFacingError("Move this group's players before changing its branch.");
    }
    const row = id ? await db.ageGroup.update({ where: { id }, data }) : await db.ageGroup.create({ data });
    await audit({ actorId: user.id, action: id ? "agegroup.update" : "agegroup.create", entityType: "AgeGroup", entityId: row.id, branchId: row.branchId, before, after: row });
    revalidatePath("/settings/age-groups");
    return { ok: true, message: id ? "Age group updated" : "Age group created" };
  });
}

/** Moves all players, staff assignments and future sessions from source into target, then deactivates source. */
export async function mergeAgeGroups(input: unknown) {
  return runAction(mergeAgeGroupSchema, input, async ({ sourceId, targetId }) => {
    const user = await authorize("agegroups.manage");
    const [source, target] = await Promise.all([db.ageGroup.findUniqueOrThrow({ where: { id: sourceId } }), db.ageGroup.findUniqueOrThrow({ where: { id: targetId } })]);
    assertBranch(user, source.branchId);
    if (source.branchId !== target.branchId) throw new UserFacingError("Both groups must be in the same branch.");
    const moved = await db.$transaction(async (tx) => {
      const players = await tx.player.findMany({ where: { ageGroupId: sourceId }, select: { id: true } });
      await tx.player.updateMany({ where: { ageGroupId: sourceId }, data: { ageGroupId: targetId } });
      await tx.playerTransfer.createMany({ data: players.map((p) => ({ playerId: p.id, fromAgeGroupId: sourceId, toAgeGroupId: targetId, reason: `Merged ${source.name} into ${target.name}`, createdById: user.id })) });
      const staff = await tx.staffAgeGroup.findMany({ where: { ageGroupId: sourceId } });
      for (const s of staff) {
        await tx.staffAgeGroup.upsert({ where: { staffId_ageGroupId: { staffId: s.staffId, ageGroupId: targetId } }, update: {}, create: { staffId: s.staffId, ageGroupId: targetId } });
      }
      await tx.staffAgeGroup.deleteMany({ where: { ageGroupId: sourceId } });
      await tx.trainingSession.updateMany({ where: { ageGroupId: sourceId, startsAt: { gte: new Date() } }, data: { ageGroupId: targetId } });
      await tx.ageGroup.update({ where: { id: sourceId }, data: { isActive: false, mergedIntoId: targetId } });
      await audit({ actorId: user.id, action: "agegroup.merge", entityType: "AgeGroup", entityId: sourceId, branchId: source.branchId, summary: `Merged ${source.name} into ${target.name} (${players.length} players)` }, tx);
      return players.length;
    });
    revalidatePath("/settings/age-groups");
    return { ok: true, message: `Merged. ${moved} players moved to ${target.name}.` };
  });
}

// ───── Users & roles ─────

async function assertCanManageUser(actor: Awaited<ReturnType<typeof authorize>>, targetUserId: string) {
  const target = await db.user.findUniqueOrThrow({ where: { id: targetUserId }, include: { roles: { include: { role: true } } } });
  const targetRank = Math.max(0, ...target.roles.map((r) => r.role.rank));
  if (target.id !== actor.id && targetRank >= actor.maxRank && actor.maxRank < 100) throw new AuthorizationError("You can't manage a user with equal or higher privileges.");
  return target;
}

export async function saveUser(input: unknown) {
  return runAction(userSchema, input, async ({ id, roles, ...d }) => {
    const actor = await authorize("users.manage");
    const roleRows = await db.role.findMany({ where: { id: { in: roles.map((r) => r.roleId) } } });
    for (const r of roles) {
      const role = roleRows.find((x) => x.id === r.roleId);
      if (!role) throw new UserFacingError("Unknown role.");
      if (role.rank >= actor.maxRank && actor.maxRank < 100) throw new AuthorizationError(`You can't grant the ${role.name} role.`);
      if (actor.branchIds !== null) {
        if (!r.branchId) throw new AuthorizationError("You can only grant roles limited to your branch.");
        assertBranch(actor, r.branchId);
      }
    }
    const result = await db.$transaction(async (tx) => {
      let userId = id;
      let setupToken: string | null = null;
      if (id) {
        await assertCanManageUser(actor, id);
        if (id === actor.id && !d.isActive) throw new UserFacingError("You can't deactivate your own account.");
        await tx.user.update({ where: { id }, data: { name: d.name, email: d.email, phone: d.phone ?? null, isActive: d.isActive } });
        await tx.userRole.deleteMany({ where: { userId: id } });
      } else {
        const u = await tx.user.create({ data: { name: d.name, email: d.email, phone: d.phone ?? null, isActive: d.isActive } });
        userId = u.id;
        setupToken = randomToken(32);
        await tx.authToken.create({ data: { userId: u.id, type: "PASSWORD_SETUP", tokenHash: sha256(setupToken), expiresAt: new Date(Date.now() + 7 * 86400000) } });
      }
      for (const r of roles) await tx.userRole.create({ data: { userId: userId!, roleId: r.roleId, branchId: r.branchId ?? null } });
      await audit({ actorId: actor.id, action: id ? "user.update" : "user.create", entityType: "User", entityId: userId, after: { ...d, roles } }, tx);
      return { userId: userId!, setupToken };
    });
    // Role or status changes take effect immediately: permissions are re-read every request,
    // and deactivated users lose all sessions.
    if (id && !d.isActive) await revokeUserSessions(id);
    revalidatePath("/settings/users");
    return { ok: true, message: id ? "User updated" : "User created", data: result.setupToken ? { link: `${env.appUrl}/setup-password?token=${result.setupToken}` } : undefined };
  });
}

/** Issues a fresh one-time password setup/reset link (shown to the admin to share securely). */
export async function issuePasswordLink(userId: string): Promise<ActionResult<{ link: string }>> {
  return runAction(z.string().min(1), userId, async (uid) => {
    const actor = await authorize("users.manage");
    await assertCanManageUser(actor, uid);
    const token = randomToken(32);
    await db.$transaction([
      db.authToken.updateMany({ where: { userId: uid, usedAt: null }, data: { usedAt: new Date() } }),
      db.authToken.create({ data: { userId: uid, type: "PASSWORD_RESET", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 2 * 86400000) } }),
    ]);
    await audit({ actorId: actor.id, action: "user.password_link", entityType: "User", entityId: uid });
    return { ok: true, data: { link: `${env.appUrl}/setup-password?token=${token}` } };
  });
}

export async function saveRolePermissions(input: unknown) {
  return runAction(rolePermissionsSchema, input, async ({ roleId, permissionKeys }) => {
    const actor = await authorize("roles.manage");
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId } });
    if (role.key === "SUPER_ADMIN") throw new UserFacingError("The Academy President role always has every permission.");
    if (role.rank >= actor.maxRank && actor.maxRank < 100) throw new AuthorizationError();
    const keys = permissionKeys.filter((k) => (ALL_PERMISSIONS as string[]).includes(k));
    const perms = await db.permission.findMany({ where: { key: { in: keys } } });
    const before = await db.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
    await db.$transaction([db.rolePermission.deleteMany({ where: { roleId } }), db.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) })]);
    await audit({ actorId: actor.id, action: "role.permissions", entityType: "Role", entityId: roleId, summary: role.name, before: before.map((b) => b.permission.key), after: keys });
    revalidatePath("/settings/roles");
    return { ok: true, message: `${role.name} permissions saved` };
  });
}
