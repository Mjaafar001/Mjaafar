import "server-only";
import { db, type Tx } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import type { CreditEntryType } from "@/generated/prisma/enums";

export async function creditBalance(playerId: string, client: Tx | typeof db = db) {
  const r = await client.sessionCreditEntry.aggregate({ where: { playerId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

export async function creditBalances(playerIds: string[]) {
  if (playerIds.length === 0) return new Map<string, number>();
  const rows = await db.sessionCreditEntry.groupBy({ by: ["playerId"], where: { playerId: { in: playerIds } }, _sum: { delta: true } });
  return new Map(rows.map((r) => [r.playerId, r._sum.delta ?? 0]));
}

/** Players whose credit balance is <= threshold (only players that have ever had credits). */
export async function playersWithLowCredits(where: { branchId?: { in: string[] } }, threshold = 0) {
  const rows = await db.$queryRaw<{ playerId: string; balance: bigint }[]>`
    SELECT e."playerId", SUM(e."delta")::bigint AS balance
    FROM "SessionCreditEntry" e JOIN "Player" p ON p.id = e."playerId"
    WHERE p."status" IN ('ACTIVE','TRIAL') AND p."archivedAt" IS NULL
    GROUP BY e."playerId" HAVING SUM(e."delta") <= ${threshold}`;
  const ids = rows.map((r) => r.playerId);
  const players = await db.player.findMany({ where: { id: { in: ids }, ...where }, include: { ageGroup: true } });
  const bal = new Map(rows.map((r) => [r.playerId, Number(r.balance)]));
  return players.map((p) => ({ player: p, balance: bal.get(p.id) ?? 0 }));
}

/** Manual grant / adjustment with a mandatory reason. Always audited by the caller. */
export async function postCreditAdjustment(
  tx: Tx,
  input: { playerId: string; delta: number; type: Extract<CreditEntryType, "MANUAL_ADJUSTMENT" | "MAKEUP_GRANT" | "ALLOCATION">; reason: string; actorId: string; subscriptionId?: string; idempotencyKey?: string },
) {
  return tx.sessionCreditEntry.create({
    data: {
      playerId: input.playerId,
      delta: input.delta,
      type: input.type,
      reason: input.reason,
      createdById: input.actorId,
      subscriptionId: input.subscriptionId,
      idempotencyKey: input.idempotencyKey ?? `adj:${input.playerId}:${randomToken(12)}`,
    },
  });
}
