import "server-only";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { Prisma } from "@/generated/prisma/client";
import { branchWhere } from "@/lib/rbac/authorize";

/**
 * The single place that decides which players a user may see.
 *  - players.view            → every player in the user's branches
 *  - players.view.assigned   → players in the coach's age groups or where they are primary coach
 *  - portal.parent           → linked children only
 *  - portal.player           → own record only
 */
export function playerScope(user: CurrentUser): Prisma.PlayerWhereInput {
  if (user.permissions.has("players.view")) return { ...branchWhere(user) };
  if (user.permissions.has("players.view.assigned") && user.staffId) {
    return {
      ...branchWhere(user),
      OR: [{ primaryCoachId: user.staffId }, { ageGroup: { staff: { some: { staffId: user.staffId } } } }],
    };
  }
  if (user.permissions.has("portal.parent") && user.guardianId) return { guardians: { some: { guardianId: user.guardianId } } };
  if (user.permissions.has("portal.player") && user.playerId) return { id: user.playerId };
  return { id: "__none__" };
}

/** Sessions visible to a user. Coaches with only assigned scope see their own / their groups' sessions. */
export function sessionScope(user: CurrentUser): Prisma.TrainingSessionWhereInput {
  if (user.permissions.has("players.view") || !user.staffId) return { ...branchWhere(user) };
  return {
    ...branchWhere(user),
    OR: [
      { coachId: user.staffId },
      { assistants: { some: { staffId: user.staffId } } },
      { ageGroup: { staff: { some: { staffId: user.staffId } } } },
    ],
  };
}
