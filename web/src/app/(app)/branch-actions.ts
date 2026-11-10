"use server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/current-user";
import { canAccessBranch } from "@/lib/rbac/authorize";
import { BRANCH_COOKIE } from "@/lib/branch-context";

export async function setActiveBranchAction(branchId: string | null) {
  const user = await requireUser();
  const jar = await cookies();
  if (!branchId) jar.delete(BRANCH_COOKIE);
  else if (canAccessBranch(user, branchId)) jar.set(BRANCH_COOKIE, branchId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
}
