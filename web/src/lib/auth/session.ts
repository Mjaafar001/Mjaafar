import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export const SESSION_COOKIE = "mj_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // absolute lifetime
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // sign out after 12h of inactivity

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** Creates a DB-backed session and sets the cookie. Only call from server actions / route handlers. */
export async function createSession(userId: string, mfaVerified: boolean) {
  const token = randomToken(32);
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { tokenHash: sha256(token), userId, mfaVerified, expiresAt, ip: meta.ip, userAgent: meta.userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Reads and validates the session from the cookie. Pure read; safe in server components. */
export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS < now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Throttle activity writes to once per 5 minutes.
  if (now - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export async function markSessionMfaVerified(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session of a user (password change, deactivation, role removal). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
