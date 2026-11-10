import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { playerScope } from "./scope";
import { scopedBranchWhere } from "@/lib/branch-context";
import { localToUtc, addDaysToDateString } from "@/lib/dates";

/** Per-player attendance over a date range (cancelled sessions excluded). */
export async function attendanceReport(user: CurrentUser, opts: { from: string; to: string; ageGroupId?: string }) {
  const start = localToUtc(opts.from, "00:00");
  const end = localToUtc(addDaysToDateString(opts.to, 1), "00:00");
  const players = await db.player.findMany({
    where: { AND: [playerScope(user), await scopedBranchWhere(user), { archivedAt: null, status: { in: ["ACTIVE", "TRIAL"] } }, opts.ageGroupId ? { ageGroupId: opts.ageGroupId } : {}] },
    include: { ageGroup: true },
    orderBy: [{ ageGroup: { sortOrder: "asc" } }, { firstName: "asc" }],
  });
  const rows = await db.attendance.groupBy({
    by: ["playerId", "status"],
    where: { playerId: { in: players.map((p) => p.id) }, session: { startsAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } },
    _count: true,
  });
  const byPlayer = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = byPlayer.get(r.playerId) ?? {};
    m[r.status] = r._count;
    byPlayer.set(r.playerId, m);
  }
  return players.map((p) => {
    const c = byPlayer.get(p.id) ?? {};
    const present = (c.PRESENT ?? 0) + (c.LATE ?? 0);
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    return { player: p, present: c.PRESENT ?? 0, late: c.LATE ?? 0, absent: c.ABSENT ?? 0, excused: c.EXCUSED ?? 0, injured: c.INJURED ?? 0, total, rate: total ? Math.round((present / total) * 100) : null };
  });
}
