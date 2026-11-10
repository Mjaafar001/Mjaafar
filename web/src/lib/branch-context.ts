import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { canAccessBranch } from "@/lib/rbac/authorize";

export const BRANCH_COOKIE = "mj_branch";

/** Branches the user may access (for selectors). */
export async function accessibleBranches(user: CurrentUser) {
  return db.branch.findMany({
    where: { isActive: true, ...(user.branchIds === null ? {} : { id: { in: user.branchIds } }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

/**
 * The branch currently selected in the top bar (or null = all permitted branches).
 * Users limited to a single branch always get that branch.
 */
export async function activeBranchId(user: CurrentUser): Promise<string | null> {
  if (user.branchIds && user.branchIds.length === 1) return user.branchIds[0]!;
  const v = (await cookies()).get(BRANCH_COOKIE)?.value;
  return v && canAccessBranch(user, v) ? v : null;
}

/** `where` fragment: user's permitted branches narrowed to the selected branch. */
export async function scopedBranchWhere(user: CurrentUser): Promise<{ branchId?: string | { in: string[] } }> {
  const active = await activeBranchId(user);
  if (active) return { branchId: active };
  return user.branchIds === null ? {} : { branchId: { in: user.branchIds } };
}
