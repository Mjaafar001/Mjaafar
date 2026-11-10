import "server-only";
import { forbidden } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/current-user";
import type { PermissionKey } from "./permissions";

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function can(user: CurrentUser, ...anyOf: PermissionKey[]) {
  return anyOf.some((p) => user.permissions.has(p));
}

export function canAccessBranch(user: CurrentUser, branchId: string | null | undefined) {
  if (!branchId) return user.branchIds === null;
  return user.branchIds === null || user.branchIds.includes(branchId);
}

/** Prisma `where` fragment limiting rows to the user's branches. */
export function branchWhere(user: CurrentUser): { branchId?: { in: string[] } } {
  return user.branchIds === null ? {} : { branchId: { in: user.branchIds } };
}

/** For pages: requires any of the permissions or renders the 403 page. */
export async function requirePermission(...anyOf: PermissionKey[]) {
  const user = await requireUser();
  if (!can(user, ...anyOf)) forbidden();
  return user;
}

/** For server actions: throws an AuthorizationError (converted to a form error by `action`). */
export async function authorize(...anyOf: PermissionKey[]) {
  const user = await requireUser();
  if (!can(user, ...anyOf)) throw new AuthorizationError();
  return user;
}

export function assertBranch(user: CurrentUser, branchId: string | null | undefined) {
  if (!canAccessBranch(user, branchId)) throw new AuthorizationError("You do not have access to that branch.");
}
