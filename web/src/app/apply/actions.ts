"use server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { parseDateOnly } from "@/lib/dates";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requestMeta } from "@/lib/auth/session";
import { storeFile } from "@/lib/storage";
import { generateRegistrationRef } from "@/lib/academy-id";
import { sendTemplatedEmail } from "@/lib/notify";
import { getBranding } from "@/lib/branding";
import { applicationSchema, CONSENT_VERSION } from "@/lib/validators/registration";
import type { ActionResult } from "@/lib/action";

/**
 * Public online application. Protected by rate limiting and a honeypot field.
 * Medical answers are encrypted before storage; nothing about the child is publicly retrievable.
 */
export async function submitApplication(formData: FormData): Promise<ActionResult<{ reference: string }>> {
  const { ip } = await requestMeta();
  const rl = await rateLimit(`apply:${ip ?? "unknown"}`, 5, 3600);
  if (!rl.ok) return { ok: false, error: "Too many applications from this connection. Please try again later or contact the academy." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { ok: false, error: "Invalid submission." };
  }
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[i.path.join(".")] ??= []).push(i.message);
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.website) return { ok: true, data: { reference: "APP-RECEIVED" } }; // honeypot: pretend success

  const branch = await db.branch.findFirst({ where: { id: d.branchId, isActive: true } });
  if (!branch) return { ok: false, error: "Choose a branch." };
  if (d.requestedAgeGroupId) {
    const g = await db.ageGroup.findFirst({ where: { id: d.requestedAgeGroupId, branchId: branch.id, isActive: true } });
    if (!g) return { ok: false, error: "Choose a valid age group." };
  }

  const file = formData.get("birthCertificate");
  let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
  if (file instanceof File && file.size > 0) {
    stored = await storeFile("registrations", file, ["image", "pdf"]);
    if (!stored.ok) return { ok: false, error: stored.error };
  }

  const { medical, ...publicPart } = d;
  const primary = d.guardians[0]!;
  const reg = await db.$transaction(async (tx) => {
    const reference = await generateRegistrationRef(tx);
    const r = await tx.registration.create({
      data: {
        reference, branchId: branch.id, type: d.type, requestedAgeGroupId: d.requestedAgeGroupId ?? null,
        childFirstName: d.child.firstName, childLastName: d.child.lastName, childDateOfBirth: parseDateOnly(d.child.dateOfBirth), childGender: d.child.gender,
        guardianFirstName: primary.firstName, guardianLastName: primary.lastName, guardianEmail: primary.email ?? null, guardianPhone: primary.phone,
        payload: JSON.parse(JSON.stringify(publicPart)), medicalEnc: encrypt(JSON.stringify(medical)), submittedIp: ip,
      },
    });
    const consents = [
      ["PARTICIPATION", d.consents.participation], ["MEDICAL_TREATMENT", d.consents.medicalTreatment], ["DATA_PROCESSING", d.consents.dataProcessing],
      ["PHOTO", d.consents.photo], ["VIDEO", d.consents.video],
    ] as const;
    await tx.consentRecord.createMany({ data: consents.map(([type, granted]) => ({ type, granted, version: CONSENT_VERSION, signedName: d.consents.signedName, registrationId: r.id, ip })) });
    if (stored?.ok) {
      await tx.document.create({ data: { type: "BIRTH_CERTIFICATE", title: `Birth certificate — ${d.child.firstName} ${d.child.lastName}`, storageKey: stored.key, mimeType: stored.mime, sizeBytes: stored.size, sha256: stored.sha256, registrationId: r.id, isSensitive: true } });
    }
    await audit({ actorId: null, action: "registration.submit", entityType: "Registration", entityId: r.id, branchId: branch.id, summary: `${reference}: ${d.child.firstName} ${d.child.lastName}` }, tx);
    return r;
  });

  if (primary.email) {
    const b = await getBranding();
    await sendTemplatedEmail("registration_received", primary.email, { guardianName: primary.firstName, academyName: b.name, reference: reg.reference }, { dedupeKey: `reg-received:${reg.id}` });
  }
  return { ok: true, data: { reference: reg.reference } };
}
