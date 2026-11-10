import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { branchWhere, can } from "@/lib/rbac/authorize";
import { accessibleBranches } from "@/lib/branch-context";
import type { PlayerFormOptions } from "./player-form";

export async function playerFormOptions(user: CurrentUser): Promise<PlayerFormOptions> {
  const [branches, groups, coaches, settings] = await Promise.all([
    accessibleBranches(user),
    db.ageGroup.findMany({ where: branchWhere(user), orderBy: { sortOrder: "asc" }, select: { id: true, name: true, branchId: true, minAge: true, maxAgeExclusive: true, isActive: true, sortOrder: true } }),
    db.staffProfile.findMany({ where: { ...branchWhere(user), employmentStatus: { in: ["ACTIVE", "PROBATION"] }, staffType: { in: ["HEAD_COACH", "COACH", "ASSISTANT_COACH", "GOALKEEPER_COACH", "FITNESS_COACH"] } }, orderBy: { firstName: "asc" } }),
    db.academySettings.findUniqueOrThrow({ where: { id: "default" } }),
  ]);
  return {
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    groups,
    coaches: coaches.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, branchId: c.branchId })),
    cutoff: { month: settings.ageCutoffMonth, day: settings.ageCutoffDay },
    canTransfer: can(user, "players.transfer"),
  };
}
