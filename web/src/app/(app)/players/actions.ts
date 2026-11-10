"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authorize, assertBranch, AuthorizationError } from "@/lib/rbac/authorize";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action";
import { generateAcademyId } from "@/lib/academy-id";
import { parseDateOnly } from "@/lib/dates";
import { encrypt } from "@/lib/crypto";
import { storeFile } from "@/lib/storage";
import { postCreditAdjustment } from "@/lib/services/credits";
import { playerScope } from "@/lib/services/scope";
import { ageGroupOccupancy } from "@/lib/services/registrations";
import { achievementSchema, creditAdjustSchema, linkGuardianSchema, medicalSchema, newPlayerSchema, playerSchema, transferSchema, PLAYER_STATUSES } from "@/lib/validators/player";
import type { CurrentUser } from "@/lib/auth/current-user";

/** Loads a player the user is allowed to see, or throws. */
async function loadPlayerFor(user: CurrentUser, id: string) {
  const p = await db.player.findFirst({ where: { id, ...playerScope(user) } });
  if (!p) throw new AuthorizationError("Player not found or not accessible.");
  return p;
}

async function assertGroup(ageGroupId: string | undefined, branchId: string, excludePlayerId?: string) {
  if (!ageGroupId) return;
  const g = await db.ageGroup.findUnique({ where: { id: ageGroupId } });
  if (!g || g.branchId !== branchId) throw new UserFacingError("That age group belongs to another branch.");
  if (!g.isActive) throw new UserFacingError(`${g.name} is inactive.`);
  if (g.capacity != null) {
    const count = await ageGroupOccupancy(g.id);
    const already = excludePlayerId ? await db.player.count({ where: { id: excludePlayerId, ageGroupId: g.id } }) : 0;
    if (count - already >= g.capacity) throw new UserFacingError(`${g.name} is full (${g.capacity}). Raise its capacity or choose another group.`);
  }
}

function playerData(d: z.output<typeof playerSchema>) {
  return {
    branchId: d.branchId, firstName: d.firstName, middleName: d.middleName ?? null, lastName: d.lastName, preferredName: d.preferredName ?? null,
    dateOfBirth: parseDateOnly(d.dateOfBirth), gender: d.gender, nationality: d.nationality ?? "Nigerian", address: d.address ?? null, city: d.city ?? null,
    state: d.state ?? null, phone: d.phone ?? null, status: d.status, ageGroupId: d.ageGroupId ?? null, primaryCoachId: d.primaryCoachId ?? null,
    preferredPosition: d.preferredPosition ?? null, secondaryPosition: d.secondaryPosition ?? null, dominantFoot: d.dominantFoot ?? null,
    previousExperience: d.previousExperience ?? null, jerseyNumber: d.jerseyNumber ?? null, jerseySize: d.jerseySize ?? null, schoolName: d.schoolName ?? null,
    notes: d.notes ?? null, photoConsent: d.photoConsent, videoConsent: d.videoConsent,
    ...(d.registrationDate ? { registrationDate: parseDateOnly(d.registrationDate) } : {}),
  };
}

export async function createPlayer(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(newPlayerSchema, input, async (d) => {
    const user = await authorize("players.create");
    assertBranch(user, d.branchId);
    await assertGroup(d.ageGroupId, d.branchId);
    const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });
    const player = await db.$transaction(async (tx) => {
      const academyId = await generateAcademyId(tx, settings.academyIdPrefix);
      const p = await tx.player.create({ data: { ...playerData(d), academyId, medical: { create: { updatedById: user.id } } } });
      const g = d.guardian;
      const email = g.email ?? null;
      const existing = await tx.guardian.findFirst({ where: { OR: [...(email ? [{ email }] : []), { phone: g.phone }] } });
      const guardian = existing ?? (await tx.guardian.create({ data: { firstName: g.firstName, lastName: g.lastName, phone: g.phone, whatsapp: g.whatsapp ?? g.phone, email, address: g.address ?? null, occupation: g.occupation ?? null } }));
      await tx.playerGuardian.create({ data: { playerId: p.id, guardianId: guardian.id, relationship: g.relationship, isPrimary: true } });
      if (d.openingCredits) {
        await postCreditAdjustment(tx, { playerId: p.id, delta: d.openingCredits, type: "ALLOCATION", reason: "Opening balance at registration", actorId: user.id });
      }
      await audit({ actorId: user.id, action: "player.create", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: `Registered ${p.firstName} ${p.lastName} (${academyId})${existing ? " — linked to existing guardian" : ""}` }, tx);
      return p;
    });
    revalidatePath("/players");
    return { ok: true, message: `Player registered (${player.academyId})`, data: { id: player.id } };
  });
}

export async function updatePlayer(input: unknown) {
  return runAction(playerSchema, input, async (d) => {
    const user = await authorize("players.update");
    if (!d.id) throw new UserFacingError("Missing player.");
    const before = await loadPlayerFor(user, d.id);
    assertBranch(user, d.branchId);
    if (before.branchId !== d.branchId && !user.permissions.has("players.transfer")) throw new AuthorizationError("Moving players between branches requires transfer permission.");
    if (before.ageGroupId !== (d.ageGroupId ?? null)) await assertGroup(d.ageGroupId, d.branchId, d.id);
    const after = await db.$transaction(async (tx) => {
      const p = await tx.player.update({ where: { id: d.id }, data: playerData(d) });
      if (before.ageGroupId !== p.ageGroupId || before.branchId !== p.branchId) {
        await tx.playerTransfer.create({ data: { playerId: p.id, fromBranchId: before.branchId, toBranchId: p.branchId, fromAgeGroupId: before.ageGroupId, toAgeGroupId: p.ageGroupId, reason: "Profile edit", createdById: user.id } });
      }
      await audit({ actorId: user.id, action: "player.update", entityType: "Player", entityId: p.id, branchId: p.branchId, before, after: p }, tx);
      return p;
    });
    revalidatePath(`/players/${after.id}`);
    return { ok: true, message: "Player updated" };
  });
}

export async function transferPlayer(input: unknown) {
  return runAction(transferSchema, input, async (d) => {
    const user = await authorize("players.transfer");
    const before = await loadPlayerFor(user, d.playerId);
    assertBranch(user, d.toBranchId);
    await assertGroup(d.toAgeGroupId, d.toBranchId, d.playerId);
    await db.$transaction(async (tx) => {
      await tx.player.update({ where: { id: d.playerId }, data: { branchId: d.toBranchId, ageGroupId: d.toAgeGroupId ?? null, ...(before.branchId !== d.toBranchId ? { primaryCoachId: null } : {}) } });
      await tx.playerTransfer.create({ data: { playerId: d.playerId, fromBranchId: before.branchId, toBranchId: d.toBranchId, fromAgeGroupId: before.ageGroupId, toAgeGroupId: d.toAgeGroupId ?? null, reason: d.reason, createdById: user.id } });
      await audit({ actorId: user.id, action: "player.transfer", entityType: "Player", entityId: d.playerId, branchId: d.toBranchId, summary: d.reason, before: { branchId: before.branchId, ageGroupId: before.ageGroupId }, after: { branchId: d.toBranchId, ageGroupId: d.toAgeGroupId } }, tx);
    });
    revalidatePath(`/players/${d.playerId}`);
    return { ok: true, message: "Player moved" };
  });
}

/** Archive keeps all history (attendance, ledger, payments); the player disappears from active lists. */
export async function setArchived(playerId: string, archived: boolean, reason?: string) {
  return runAction(z.object({ playerId: z.string(), archived: z.boolean(), reason: z.string().max(300).optional() }), { playerId, archived, reason }, async (d) => {
    const user = await authorize("players.archive");
    const p = await loadPlayerFor(user, d.playerId);
    await db.player.update({ where: { id: p.id }, data: { archivedAt: d.archived ? new Date() : null, ...(d.archived ? { status: p.status === "ACTIVE" ? "INACTIVE" : p.status } : {}) } });
    await audit({ actorId: user.id, action: d.archived ? "player.archive" : "player.restore", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: d.reason });
    revalidatePath("/players");
    return { ok: true, message: d.archived ? "Player archived" : "Player restored" };
  });
}

export async function bulkUpdatePlayers(input: unknown) {
  const schema = z.object({ ids: z.array(z.string()).min(1).max(500), status: z.enum(PLAYER_STATUSES).optional(), ageGroupId: z.string().optional() }).refine((v) => v.status || v.ageGroupId, "Choose a change");
  return runAction(schema, input, async (d) => {
    const user = await authorize("players.update");
    const players = await db.player.findMany({ where: { id: { in: d.ids }, ...playerScope(user) } });
    if (players.length !== d.ids.length) throw new AuthorizationError("Some players are not accessible.");
    if (d.ageGroupId) {
      const g = await db.ageGroup.findUniqueOrThrow({ where: { id: d.ageGroupId } });
      if (players.some((p) => p.branchId !== g.branchId)) throw new UserFacingError("All selected players must be in the age group's branch.");
      if (g.capacity != null) {
        const incoming = players.filter((p) => p.ageGroupId !== g.id).length;
        if ((await ageGroupOccupancy(g.id)) + incoming > g.capacity) throw new UserFacingError(`${g.name} doesn't have room for ${incoming} more players.`);
      }
    }
    await db.$transaction(async (tx) => {
      await tx.player.updateMany({ where: { id: { in: d.ids } }, data: { ...(d.status ? { status: d.status } : {}), ...(d.ageGroupId ? { ageGroupId: d.ageGroupId } : {}) } });
      if (d.ageGroupId) {
        await tx.playerTransfer.createMany({ data: players.filter((p) => p.ageGroupId !== d.ageGroupId).map((p) => ({ playerId: p.id, fromAgeGroupId: p.ageGroupId, toAgeGroupId: d.ageGroupId, fromBranchId: p.branchId, toBranchId: p.branchId, reason: "Bulk update", createdById: user.id })) });
      }
      await audit({ actorId: user.id, action: "player.bulk_update", entityType: "Player", summary: `${d.ids.length} players: ${d.status ? `status → ${d.status}` : ""} ${d.ageGroupId ? "age group changed" : ""}`.trim(), after: d }, tx);
    });
    revalidatePath("/players");
    return { ok: true, message: `${d.ids.length} players updated` };
  });
}

export async function updateMedical(input: unknown) {
  return runAction(medicalSchema, input, async (d) => {
    const user = await authorize("medical.update");
    const p = await loadPlayerFor(user, d.playerId);
    const data = {
      conditionsEnc: encrypt(d.conditions), allergiesEnc: encrypt(d.allergies), medicationsEnc: encrypt(d.medications),
      emergencyInstructionsEnc: encrypt(d.emergencyInstructions), bloodGroupEnc: encrypt(d.bloodGroup), doctorNameEnc: encrypt(d.doctorName), doctorPhoneEnc: encrypt(d.doctorPhone),
      clearanceStatus: d.clearanceStatus, clearanceExpiresAt: d.clearanceExpiresAt ? parseDateOnly(d.clearanceExpiresAt) : null, updatedById: user.id,
    };
    await db.medicalRecord.upsert({ where: { playerId: p.id }, update: data, create: { playerId: p.id, ...data } });
    // Medical content itself is never written to the audit log.
    await audit({ actorId: user.id, action: "medical.update", entityType: "MedicalRecord", entityId: p.id, branchId: p.branchId, summary: `Clearance: ${d.clearanceStatus}` });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: "Medical information saved" };
  });
}

export async function linkGuardian(input: unknown) {
  return runAction(linkGuardianSchema, input, async (d) => {
    const user = await authorize("players.update");
    const p = await loadPlayerFor(user, d.playerId);
    await db.$transaction(async (tx) => {
      const existing = await tx.guardian.findFirst({ where: { OR: [...(d.email ? [{ email: d.email }] : []), { phone: d.phone }] } });
      const g = existing ?? (await tx.guardian.create({ data: { firstName: d.firstName, lastName: d.lastName, phone: d.phone, whatsapp: d.whatsapp ?? d.phone, email: d.email ?? null, address: d.address ?? null, occupation: d.occupation ?? null } }));
      if (d.isPrimary) await tx.playerGuardian.updateMany({ where: { playerId: p.id }, data: { isPrimary: false } });
      await tx.playerGuardian.upsert({
        where: { playerId_guardianId: { playerId: p.id, guardianId: g.id } },
        update: { relationship: d.relationship, isPrimary: d.isPrimary, receivesBilling: d.receivesBilling },
        create: { playerId: p.id, guardianId: g.id, relationship: d.relationship, isPrimary: d.isPrimary, receivesBilling: d.receivesBilling },
      });
      await audit({ actorId: user.id, action: "guardian.link", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: `${g.firstName} ${g.lastName} (${d.relationship})${existing ? " — existing guardian" : ""}` }, tx);
    });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: "Guardian linked" };
  });
}

export async function unlinkGuardian(playerId: string, guardianId: string) {
  return runAction(z.object({ playerId: z.string(), guardianId: z.string() }), { playerId, guardianId }, async (d) => {
    const user = await authorize("players.update");
    const p = await loadPlayerFor(user, d.playerId);
    const count = await db.playerGuardian.count({ where: { playerId: p.id } });
    if (count <= 1) throw new UserFacingError("A player must have at least one guardian.");
    await db.playerGuardian.delete({ where: { playerId_guardianId: { playerId: p.id, guardianId: d.guardianId } } });
    await audit({ actorId: user.id, action: "guardian.unlink", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: `Guardian ${d.guardianId} removed` });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: "Guardian removed" };
  });
}

export async function adjustCredits(input: unknown) {
  return runAction(creditAdjustSchema, input, async (d) => {
    const user = await authorize("credits.adjust");
    const p = await loadPlayerFor(user, d.playerId);
    await db.$transaction(async (tx) => {
      const entry = await postCreditAdjustment(tx, { playerId: p.id, delta: d.delta, type: d.type, reason: d.reason, actorId: user.id });
      await audit({ actorId: user.id, action: "credits.adjust", entityType: "SessionCreditEntry", entityId: entry.id, branchId: p.branchId, summary: `${d.delta > 0 ? "+" : ""}${d.delta} for ${p.firstName} ${p.lastName}: ${d.reason}` }, tx);
    });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: "Credits adjusted" };
  });
}

export async function addAchievement(input: unknown) {
  return runAction(achievementSchema, input, async (d) => {
    const user = await authorize("players.update", "development.assess");
    const p = await loadPlayerFor(user, d.playerId);
    await db.achievement.create({ data: { playerId: p.id, title: d.title, description: d.description ?? null, awardedOn: parseDateOnly(d.awardedOn), createdById: user.id } });
    await audit({ actorId: user.id, action: "achievement.add", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: d.title });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: "Achievement added" };
  });
}

const DOC_TYPES = ["REGISTRATION_FORM", "BIRTH_CERTIFICATE", "CONSENT_FORM", "MEDICAL_CLEARANCE", "PLAYER_AGREEMENT", "CERTIFICATE", "OTHER"] as const;

export async function uploadPlayerFile(formData: FormData): Promise<ActionResult> {
  const meta = z.object({ playerId: z.string(), kind: z.enum(["photo", "document"]), type: z.enum(DOC_TYPES).optional(), title: z.string().max(120).optional(), expiresAt: z.string().optional() }).safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!meta.success) return { ok: false, error: "Invalid upload." };
  try {
    const user = await authorize(meta.data.kind === "photo" ? "players.update" : "documents.manage");
    const p = await loadPlayerFor(user, meta.data.playerId);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
    const stored = await storeFile(meta.data.kind === "photo" ? "players/photos" : "players/documents", file, meta.data.kind === "photo" ? ["image"] : ["image", "pdf"]);
    if (!stored.ok) return { ok: false, error: stored.error };
    if (meta.data.kind === "photo") {
      await db.player.update({ where: { id: p.id }, data: { photoKey: stored.key } });
    } else {
      const type = meta.data.type ?? "OTHER";
      await db.document.create({
        data: {
          type, title: meta.data.title || file.name.slice(0, 120), storageKey: stored.key, mimeType: stored.mime, sizeBytes: stored.size, sha256: stored.sha256,
          playerId: p.id, uploadedById: user.id, isSensitive: type === "MEDICAL_CLEARANCE" || type === "BIRTH_CERTIFICATE",
          expiresAt: meta.data.expiresAt ? parseDateOnly(meta.data.expiresAt) : null,
        },
      });
    }
    await audit({ actorId: user.id, action: meta.data.kind === "photo" ? "player.photo" : "document.upload", entityType: "Player", entityId: p.id, branchId: p.branchId, summary: meta.data.title });
    revalidatePath(`/players/${p.id}`);
    return { ok: true, message: meta.data.kind === "photo" ? "Photo updated" : "Document uploaded" };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteDocument(documentId: string) {
  return runAction(z.string(), documentId, async (id) => {
    const user = await authorize("documents.manage");
    const doc = await db.document.findUniqueOrThrow({ where: { id } });
    if (doc.playerId) await loadPlayerFor(user, doc.playerId);
    // Soft delete: retained for the audit trail until the retention policy purges it.
    await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: user.id, action: "document.delete", entityType: "Document", entityId: id, summary: doc.title });
    revalidatePath(`/players/${doc.playerId}`);
    return { ok: true, message: "Document removed" };
  });
}

/** Decrypts medical data on demand. Every reveal is audited (children's sensitive data). */
export async function revealMedical(playerId: string) {
  return runAction(z.string(), playerId, async (id) => {
    const user = await authorize("medical.view");
    const p = await loadPlayerFor(user, id);
    const { decrypt } = await import("@/lib/crypto");
    const m = await db.medicalRecord.findUnique({ where: { playerId: p.id } });
    await audit({ actorId: user.id, action: "medical.view", entityType: "MedicalRecord", entityId: p.id, branchId: p.branchId });
    return {
      ok: true,
      data: {
        conditions: decrypt(m?.conditionsEnc) ?? "", allergies: decrypt(m?.allergiesEnc) ?? "", medications: decrypt(m?.medicationsEnc) ?? "",
        emergencyInstructions: decrypt(m?.emergencyInstructionsEnc) ?? "", bloodGroup: decrypt(m?.bloodGroupEnc) ?? "", doctorName: decrypt(m?.doctorNameEnc) ?? "",
        doctorPhone: decrypt(m?.doctorPhoneEnc) ?? "", clearanceStatus: m?.clearanceStatus ?? "PENDING", clearanceExpiresAt: m?.clearanceExpiresAt?.toISOString().slice(0, 10) ?? "",
      },
    };
  });
}
