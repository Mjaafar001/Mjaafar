import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Replaces {{placeholders}} in a template body. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
}

let transport: Transporter | null = null;

/**
 * Sends an email if SMTP is configured; otherwise records it as NOT_SENT_NO_PROVIDER.
 * Never reports a delivery that didn't happen. WhatsApp and the job queue arrive in Phase 4.
 */
export async function sendEmail(input: { to: string; subject: string; body: string; templateKey?: string; userId?: string | null; guardianId?: string | null; dedupeKey?: string }) {
  if (input.dedupeKey) {
    const existing = await db.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return existing;
  }
  const n = await db.notification.create({
    data: { channel: "EMAIL", recipient: input.to, subject: input.subject, body: input.body, templateKey: input.templateKey, userId: input.userId ?? null, guardianId: input.guardianId ?? null, dedupeKey: input.dedupeKey, status: "QUEUED" },
  });
  if (!env.smtpUrl) {
    return db.notification.update({ where: { id: n.id }, data: { status: "NOT_SENT_NO_PROVIDER", error: "SMTP_URL is not configured" } });
  }
  try {
    transport ??= nodemailer.createTransport(env.smtpUrl);
    const info = await transport.sendMail({ from: env.emailFrom, to: input.to, subject: input.subject, text: input.body });
    return db.notification.update({ where: { id: n.id }, data: { status: "SENT", provider: "smtp", providerMessageId: info.messageId, sentAt: new Date(), attempts: 1 } });
  } catch (e) {
    return db.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Unknown error", attempts: 1 } });
  }
}

export async function sendTemplatedEmail(key: string, to: string, vars: Record<string, string | number | null | undefined>, extra: { userId?: string | null; guardianId?: string | null; dedupeKey?: string } = {}) {
  const t = await db.messageTemplate.findUnique({ where: { key } });
  if (!t || !t.isActive) return null;
  return sendEmail({ to, subject: renderTemplate(t.subject ?? t.name, vars), body: renderTemplate(t.body, vars), templateKey: key, ...extra });
}
