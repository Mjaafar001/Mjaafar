import "server-only";
import type { Tx } from "@/lib/db";

/** Atomically increments a named counter and returns the new value. */
export async function nextCounter(tx: Tx, key: string) {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return rows[0]!.value;
}

/** Academy IDs look like MJA-26-0042 (prefix, registration year, sequence per year). */
export async function generateAcademyId(tx: Tx, prefix: string, date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const seq = await nextCounter(tx, `academy-id:${yy}`);
  return `${prefix}-${yy}-${String(seq).padStart(4, "0")}`;
}

export async function generateRegistrationRef(tx: Tx, date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const seq = await nextCounter(tx, `registration:${yy}`);
  return `APP-${yy}-${String(seq).padStart(5, "0")}`;
}
