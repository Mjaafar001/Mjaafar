import "server-only";
import { db, type Tx } from "@/lib/db";
import { detectConflicts, type Conflict, type SessionLike } from "./schedule-rules";

/** Loads existing non-cancelled sessions overlapping [from, to) that share a coach, venue or age group. */
export async function loadPotentialConflicts(
  client: Tx | typeof db,
  window: { from: Date; to: Date },
  keys: { coachIds: string[]; venueIds: string[]; ageGroupIds: string[] },
): Promise<SessionLike[]> {
  const or = [
    keys.coachIds.length ? { coachId: { in: keys.coachIds } } : null,
    keys.venueIds.length ? { venueId: { in: keys.venueIds } } : null,
    keys.ageGroupIds.length ? { ageGroupId: { in: keys.ageGroupIds } } : null,
  ].filter(Boolean) as object[];
  if (or.length === 0) return [];
  return client.trainingSession.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { lt: window.to }, endsAt: { gt: window.from }, OR: or },
    select: { id: true, title: true, startsAt: true, endsAt: true, coachId: true, venueId: true, ageGroupId: true },
  });
}

export async function conflictsFor(
  candidates: { startsAt: Date; endsAt: Date; coachId: string | null; venueId: string | null; ageGroupId: string | null; id?: string }[],
  client: Tx | typeof db = db,
): Promise<(Conflict & { candidateStart: Date })[]> {
  if (candidates.length === 0) return [];
  const from = new Date(Math.min(...candidates.map((c) => c.startsAt.getTime())));
  const to = new Date(Math.max(...candidates.map((c) => c.endsAt.getTime())));
  const existing = await loadPotentialConflicts(client, { from, to }, {
    coachIds: [...new Set(candidates.map((c) => c.coachId).filter((x): x is string => !!x))],
    venueIds: [...new Set(candidates.map((c) => c.venueId).filter((x): x is string => !!x))],
    ageGroupIds: [...new Set(candidates.map((c) => c.ageGroupId).filter((x): x is string => !!x))],
  });
  return candidates.flatMap((c) => detectConflicts(c, existing).map((k) => ({ ...k, candidateStart: c.startsAt })));
}

export function describeConflict(c: Conflict) {
  const what = c.kind === "coach" ? "Coach is already booked" : c.kind === "venue" ? "Venue is already booked" : "Age group already has a session";
  return `${what}: ${c.withTitle}`;
}
