"use server";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/current-user";
import { decrypt, encrypt } from "@/lib/crypto";
import { newTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { markSessionMfaVerified, revokeUserSessions } from "@/lib/auth/session";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action";

export async function startMfaEnrollment(): Promise<ActionResult<{ qr: string; secret: string }>> {
  const user = await requireUser({ allowMfaSetup: true });
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { mfaPendingSecretEnc: encrypt(secret) } });
  const qr = await QRCode.toDataURL(totpUri(secret, user.email), { margin: 1, width: 220 });
  return { ok: true, data: { qr, secret } };
}

export async function confirmMfaEnrollment(input: unknown) {
  return runAction(z.object({ code: z.string().min(6).max(7) }), input, async ({ code }) => {
    const user = await requireUser({ allowMfaSetup: true });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    const secret = decrypt(row.mfaPendingSecretEnc);
    if (!secret) throw new UserFacingError("Start the setup again.");
    if (!verifyTotp(secret, code)) throw new UserFacingError("That code didn't match. Make sure your phone's clock is correct and try again.");
    await db.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecretEnc: encrypt(secret), mfaPendingSecretEnc: null } });
    await markSessionMfaVerified(user.sessionId);
    await revokeUserSessions(user.id, user.sessionId);
    await audit({ actorId: user.id, action: "auth.mfa_enabled", entityType: "User", entityId: user.id });
    return { ok: true, message: "Two-factor authentication is on." };
  });
}

export async function disableMfa(input: unknown) {
  return runAction(z.object({ password: z.string().min(1) }), input, async ({ password }) => {
    const user = await requireUser();
    if (user.mfaSetupRequired || (user.isPrivileged && user.mfaEnabled)) {
      const s = await db.academySettings.findUnique({ where: { id: "default" } });
      if (s?.mfaRequiredForPrivileged && user.isPrivileged) throw new UserFacingError("Two-factor authentication is required for your role and can't be turned off.");
    }
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(row.passwordHash, password))) throw new UserFacingError("Incorrect password.");
    await db.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
    await audit({ actorId: user.id, action: "auth.mfa_disabled", entityType: "User", entityId: user.id });
    return { ok: true, message: "Two-factor authentication is off." };
  });
}

export async function changePassword(input: unknown) {
  const schema = z.object({ current: z.string().min(1), next: z.string().max(200), confirm: z.string() }).refine((v) => v.next === v.confirm, { message: "Passwords do not match", path: ["confirm"] });
  return runAction(schema, input, async ({ current, next }) => {
    const user = await requireUser({ allowMfaSetup: true });
    const problem = passwordProblems(next);
    if (problem) throw new UserFacingError(problem);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(row.passwordHash, current))) throw new UserFacingError("Your current password is incorrect.");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await revokeUserSessions(user.id, user.sessionId);
    await audit({ actorId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id });
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  });
}
