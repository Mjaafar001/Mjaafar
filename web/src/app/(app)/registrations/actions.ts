"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authorize, assertBranch } from "@/lib/rbac/authorize";
import { runAction, UserFacingError } from "@/lib/action";
import { approveRegistration } from "@/lib/services/registrations";
import { localToUtc } from "@/lib/dates";
import { sendTemplatedEmail } from "@/lib/notify";
import { getBranding } from "@/lib/branding";
import { env } from "@/lib/env";
import { reviewSchema } from "@/lib/validators/registration";

export async function reviewRegistration(input: unknown) {
  return runAction(reviewSchema, input, async (d) => {
    const user = await authorize("registrations.review");
    const reg = await db.registration.findUniqueOrThrow({ where: { id: d.registrationId } });
    assertBranch(user, reg.branchId);
    if (reg.status === "APPROVED") throw new UserFacingError("Already approved.");

    if (d.decision === "APPROVE" || d.decision === "APPROVE_TRIAL") {
      if (!d.ageGroupId) throw new UserFacingError("Choose an age group to approve.");
      const result = await approveRegistration(reg.id, d.ageGroupId, user.id, { asTrial: d.decision === "APPROVE_TRIAL" });
      let inviteLink: string | null = null;
      if (result.parentSetupToken && result.parentEmail) {
        inviteLink = `${env.appUrl}/setup-password?token=${result.parentSetupToken}`;
        const b = await getBranding();
        await sendTemplatedEmail("parent_invite", result.parentEmail, { guardianName: reg.guardianFirstName, playerName: `${reg.childFirstName} ${reg.childLastName}`, academyName: b.name, academyId: result.academyId, link: inviteLink }, { dedupeKey: `parent-invite:${reg.id}` });
      }
      revalidatePath("/registrations");
      return { ok: true, message: `Approved — academy ID ${result.academyId}`, data: { playerId: result.playerId, inviteLink } };
    }

    const data =
      d.decision === "WAITLIST" ? { status: "WAITLISTED" as const, waitlistedAt: new Date() }
      : d.decision === "REJECT" ? { status: "REJECTED" as const }
      : d.decision === "SCHEDULE_TRIAL" ? { status: "TRIAL_SCHEDULED" as const, trialDate: d.trialDate ? localToUtc(d.trialDate.slice(0, 10), d.trialDate.slice(11, 16) || "16:00") : null }
      : { status: "UNDER_REVIEW" as const };
    if (d.decision === "SCHEDULE_TRIAL" && !d.trialDate) throw new UserFacingError("Choose the trial date and time.");
    await db.registration.update({ where: { id: reg.id }, data: { ...data, decisionNotes: d.notes ?? reg.decisionNotes, reviewedById: user.id, reviewedAt: new Date(), ...(d.ageGroupId ? { assignedAgeGroupId: d.ageGroupId } : {}) } });
    await audit({ actorId: user.id, action: `registration.${d.decision.toLowerCase()}`, entityType: "Registration", entityId: reg.id, branchId: reg.branchId, summary: `${reg.reference}${d.notes ? `: ${d.notes}` : ""}` });
    revalidatePath("/registrations");
    return { ok: true, message: "Application updated" };
  });
}
