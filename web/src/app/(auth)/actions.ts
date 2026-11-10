"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, destroySession, markSessionMfaVerified, readSession, requestMeta, revokeUserSessions } from "@/lib/auth/session";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { verifyTotp } from "@/lib/auth/totp";
import { rateLimit, clearRateLimit } from "@/lib/auth/rate-limit";
import { decrypt, randomToken, sha256 } from "@/lib/crypto";
import { loginSchema } from "@/lib/validators/registration";

export type FormState = { error?: string; ok?: boolean } | undefined;

// A real hash of a random password, verified when the account doesn't exist so response
// timing doesn't reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(16)));
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;
  const { ip } = await requestMeta();

  const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip ?? "unknown"}`, 30, 900), rateLimit(`login:email:${email}`, 10, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: `Too many sign-in attempts. Try again in ${Math.ceil(Math.max(byIp.retryAfter, byEmail.retryAfter) / 60)} minutes.` };

  const user = await db.user.findUnique({ where: { email } });
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);

  if (!user || !user.isActive || !user.passwordHash) return { error: "Incorrect email or password." };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "This account is temporarily locked after repeated failed attempts. Try again later or contact an administrator." };

  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } });
    await audit({ actorId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id });
    return { error: "Incorrect email or password." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await clearRateLimit(`login:email:${email}`);
  await createSession(user.id, !user.mfaEnabled);
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });
  const next = String(formData.get("next") ?? "");
  redirect(user.mfaEnabled ? "/login/mfa" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function verifyMfaAction(_: FormState, formData: FormData): Promise<FormState> {
  const session = await readSession();
  if (!session) redirect("/login");
  const rl = await rateLimit(`mfa:${session.userId}`, 6, 300);
  if (!rl.ok) return { error: "Too many attempts. Wait a few minutes and try again." };
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  const secret = decrypt(user.mfaSecretEnc);
  if (!secret || !verifyTotp(secret, String(formData.get("code") ?? ""))) {
    await audit({ actorId: user.id, action: "auth.mfa_failed", entityType: "User", entityId: user.id });
    return { error: "That code is not valid. Check your authenticator app and try again." };
  }
  await markSessionMfaVerified(session.id);
  await clearRateLimit(`mfa:${session.userId}`);
  await audit({ actorId: user.id, action: "auth.mfa_verified", entityType: "User", entityId: user.id });
  redirect("/");
}

export async function logoutAction() {
  const session = await readSession();
  if (session) await audit({ actorId: session.userId, action: "auth.logout", entityType: "User", entityId: session.userId });
  await destroySession();
  redirect("/login");
}

const setupSchema = z.object({ token: z.string().min(20), password: z.string().max(200), confirm: z.string() });

/** Completes a password setup / reset link (parent invitations, new staff accounts). */
export async function setupPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { error: "Passwords do not match." };
  const problem = passwordProblems(password);
  if (problem) return { error: problem };
  const { ip } = await requestMeta();
  if (!(await rateLimit(`setup:${ip}`, 10, 900)).ok) return { error: "Too many attempts. Try again later." };

  const record = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return { error: "This link has expired or was already used. Ask the academy to send a new one." };

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeUserSessions(record.userId);
  await audit({ actorId: record.userId, action: "auth.password_set", entityType: "User", entityId: record.userId });
  return { ok: true };
}
