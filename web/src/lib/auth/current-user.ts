import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { readSession } from "./session";
import type { PermissionKey, RoleKey } from "@/lib/rbac/permissions";

export type CurrentUser = {
  id: string;
  sessionId: string;
  email: string;
  name: string;
  roles: { key: RoleKey; name: string; branchId: string | null; rank: number }[];
  permissions: Set<PermissionKey>;
  /** null = every branch; otherwise the branches this user may access. */
  branchIds: string[] | null;
  isPrivileged: boolean;
  maxRank: number;
  mfaEnabled: boolean;
  mfaPending: boolean;
  mfaSetupRequired: boolean;
  staffId: string | null;
  guardianId: string | null;
  playerId: string | null;
};

/** Loads the signed-in user with roles, permissions and branch scope. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  return buildCurrentUser(session.userId, { id: session.id, mfaVerified: session.mfaVerified });
});

/** Resolves a user's effective permissions and branch scope from the database (no cookies). */
export async function buildCurrentUser(userId: string, session: { id: string; mfaVerified: boolean }): Promise<CurrentUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      staffProfile: { select: { id: true } },
      guardian: { select: { id: true } },
      player: { select: { id: true } },
    },
  });
  if (!user || !user.isActive) return null;

  const permissions = new Set<PermissionKey>();
  let allBranches = false;
  const branchIds = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
    if (ur.branchId) branchIds.add(ur.branchId);
    else allBranches = true;
  }
  const isPrivileged = user.roles.some((r) => r.role.privileged);
  const settings = await db.academySettings.findUnique({ where: { id: "default" }, select: { mfaRequiredForPrivileged: true } });
  const mfaSetupRequired = isPrivileged && !user.mfaEnabled && env.mfaEnforced && (settings?.mfaRequiredForPrivileged ?? true);

  return {
    id: user.id,
    sessionId: session.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map((r) => ({ key: r.role.key as RoleKey, name: r.role.name, branchId: r.branchId, rank: r.role.rank })),
    permissions,
    branchIds: allBranches ? null : [...branchIds],
    isPrivileged,
    maxRank: Math.max(0, ...user.roles.map((r) => r.role.rank)),
    mfaEnabled: user.mfaEnabled,
    mfaPending: user.mfaEnabled && !session.mfaVerified,
    mfaSetupRequired,
    staffId: user.staffProfile?.id ?? null,
    guardianId: user.guardian?.id ?? null,
    playerId: user.player?.id ?? null,
  };
}

/** Requires a fully authenticated user (MFA completed) or redirects. */
export async function requireUser(opts: { allowMfaSetup?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mfaPending) redirect("/login/mfa");
  if (user.mfaSetupRequired && !opts.allowMfaSetup) redirect("/account/security?setup=required");
  return user;
}
