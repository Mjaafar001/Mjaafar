import "server-only";
import { db } from "@/lib/db";
import { branchWhere } from "@/lib/rbac/authorize";
import { accessibleBranches } from "@/lib/branch-context";
import type { CurrentUser } from "@/lib/auth/current-user";

export async function staffFormData(user: CurrentUser) {
  const [branches, groups] = await Promise.all([
    accessibleBranches(user),
    db.ageGroup.findMany({ where: { ...branchWhere(user), isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, branchId: true, color: true } }),
  ]);
  return { branches: branches.map((b) => ({ id: b.id, name: b.name })), groups };
}
