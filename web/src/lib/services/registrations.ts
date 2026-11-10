import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateAcademyId } from "@/lib/academy-id";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { UserFacingError } from "@/lib/action";
import type { ApplicationInput } from "@/lib/validators/registration";

export type ApprovalResult = { playerId: string; academyId: string; parentSetupToken: string | null; parentEmail: string | null };

/** Current number of active/trial/pending players in an age group (for capacity checks). */
export async function ageGroupOccupancy(ageGroupId: string) {
  return db.player.count({ where: { ageGroupId, status: { in: ["ACTIVE", "TRIAL", "PENDING"] }, archivedAt: null } });
}

/**
 * Approves an application in one transaction:
 * creates the Player (with academy ID), Guardian(s) (re-using existing ones by email/phone so
 * siblings share a guardian), medical record, consents, and a parent portal account.
 */
export async function approveRegistration(registrationId: string, ageGroupId: string, actorId: string, opts: { asTrial?: boolean } = {}): Promise<ApprovalResult> {
  const reg = await db.registration.findUniqueOrThrow({ where: { id: registrationId } });
  if (reg.playerId) throw new UserFacingError("This application has already been approved.");
  if (["REJECTED", "WITHDRAWN"].includes(reg.status)) throw new UserFacingError("This application is closed.");

  const group = await db.ageGroup.findUniqueOrThrow({ where: { id: ageGroupId } });
  if (group.branchId !== reg.branchId) throw new UserFacingError("Age group belongs to a different branch.");
  if (group.capacity != null && (await ageGroupOccupancy(group.id)) >= group.capacity) {
    throw new UserFacingError(`${group.name} is at capacity (${group.capacity}). Wait-list the application or raise the capacity.`);
  }

  const app = reg.payload as unknown as ApplicationInput;
  const medical = reg.medicalEnc ? (JSON.parse(decrypt(reg.medicalEnc)!) as ApplicationInput["medical"]) : null;
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });
  const parentRole = await db.role.findUniqueOrThrow({ where: { key: "PARENT" } });

  return db.$transaction(async (tx) => {
    const academyId = await generateAcademyId(tx, settings.academyIdPrefix);
    const player = await tx.player.create({
      data: {
        academyId,
        branchId: reg.branchId,
        firstName: app.child.firstName,
        middleName: app.child.middleName || null,
        lastName: app.child.lastName,
        dateOfBirth: reg.childDateOfBirth,
        gender: reg.childGender,
        nationality: app.child.nationality || "Nigerian",
        address: app.child.address || null,
        city: app.child.city || null,
        state: app.child.state || null,
        schoolName: app.child.schoolName || null,
        preferredPosition: app.child.preferredPosition || null,
        dominantFoot: app.child.dominantFoot || null,
        previousExperience: app.child.previousExperience || null,
        jerseySize: app.child.jerseySize || null,
        status: opts.asTrial || reg.type === "TRIAL" ? "TRIAL" : "ACTIVE",
        ageGroupId: group.id,
        photoConsent: app.consents.photo,
        videoConsent: app.consents.video,
      },
    });

    let parentSetupToken: string | null = null;
    let parentEmail: string | null = null;
    let primaryGuardianId: string | null = null;

    for (const [i, g] of app.guardians.entries()) {
      const email = g.email?.toLowerCase() || null;
      let guardian = await tx.guardian.findFirst({ where: { OR: [...(email ? [{ email }] : []), { phone: g.phone }] } });
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: { firstName: g.firstName, lastName: g.lastName, email, phone: g.phone, whatsapp: g.whatsapp || g.phone, address: g.address || null, occupation: g.occupation || null },
        });
      }
      if (i === 0) primaryGuardianId = guardian.id;
      await tx.playerGuardian.create({ data: { playerId: player.id, guardianId: guardian.id, relationship: g.relationship, isPrimary: i === 0, isEmergencyContact: true } });

      // Portal account for guardians with an email address.
      if (email && !guardian.userId) {
        const existingUser = await tx.user.findUnique({ where: { email } });
        const user = existingUser ?? (await tx.user.create({ data: { email, name: `${g.firstName} ${g.lastName}`, phone: g.phone } }));
        await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id } });
        const hasRole = await tx.userRole.findFirst({ where: { userId: user.id, roleId: parentRole.id } });
        if (!hasRole) await tx.userRole.create({ data: { userId: user.id, roleId: parentRole.id, branchId: reg.branchId } });
        if (!user.passwordHash && i === 0) {
          parentSetupToken = randomToken(32);
          parentEmail = email;
          await tx.authToken.create({ data: { userId: user.id, type: "PASSWORD_SETUP", tokenHash: sha256(parentSetupToken), expiresAt: new Date(Date.now() + 7 * 86400000) } });
        }
      }
    }

    for (const c of app.emergencyContacts ?? []) {
      if (c.name && c.phone) await tx.emergencyContact.create({ data: { playerId: player.id, name: c.name, phone: c.phone, relationship: c.relationship || "Other" } });
    }

    await tx.medicalRecord.create({
      data: {
        playerId: player.id,
        conditionsEnc: encrypt(medical?.conditions),
        allergiesEnc: encrypt(medical?.allergies),
        medicationsEnc: encrypt(medical?.medications),
        emergencyInstructionsEnc: encrypt(medical?.emergencyInstructions),
        doctorNameEnc: encrypt(medical?.doctorName),
        doctorPhoneEnc: encrypt(medical?.doctorPhone),
        updatedById: actorId,
      },
    });

    await tx.consentRecord.updateMany({ where: { registrationId: reg.id }, data: { playerId: player.id, guardianId: primaryGuardianId } });
    await tx.document.updateMany({ where: { registrationId: reg.id }, data: { playerId: player.id } });

    await tx.registration.update({
      where: { id: reg.id },
      data: { status: "APPROVED", playerId: player.id, assignedAgeGroupId: group.id, reviewedById: actorId, reviewedAt: new Date(), waitlistedAt: null },
    });

    await audit({ actorId, action: "registration.approve", entityType: "Registration", entityId: reg.id, branchId: reg.branchId, summary: `Approved ${reg.reference} → ${academyId} (${group.name})` }, tx);
    return { playerId: player.id, academyId, parentSetupToken, parentEmail };
  });
}
