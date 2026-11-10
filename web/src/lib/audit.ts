import "server-only";
import { db, type Tx } from "@/lib/db";
import { requestMeta } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

const REDACT = new Set(["passwordHash", "mfaSecretEnc", "mfaPendingSecretEnc", "tokenHash"]);

function clean(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (k, v) => (REDACT.has(k) || k.endsWith("Enc") ? (v ? "[encrypted]" : v) : v)));
}

/** Writes an audit entry. Pass `tx` to make it part of the same transaction as the change. */
export async function audit(input: AuditInput, tx?: Tx) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    meta = await requestMeta();
  } catch {
    // Outside a request (scripts, tests).
  }
  await (tx ?? db).auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      branchId: input.branchId ?? null,
      summary: input.summary,
      before: clean(input.before),
      after: clean(input.after),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}
