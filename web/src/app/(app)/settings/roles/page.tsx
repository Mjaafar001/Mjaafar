import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { RoleMatrix } from "./role-matrix";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const actor = await requirePermission("roles.manage");
  const roles = await db.role.findMany({ orderBy: { rank: "desc" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
  const modules = [...new Set(ALL_PERMISSIONS.map((k) => PERMISSIONS[k].module))].map((m) => ({
    module: m,
    permissions: ALL_PERMISSIONS.filter((k) => PERMISSIONS[k].module === m).map((k) => ({ key: k, description: PERMISSIONS[k].description })),
  }));
  return (
    <RoleMatrix
      modules={modules}
      roles={roles.map((r) => ({
        id: r.id, key: r.key, name: r.name, description: r.description ?? "", users: r._count.users,
        editable: r.key !== "SUPER_ADMIN" && (r.rank < actor.maxRank || actor.maxRank >= 100),
        keys: r.permissions.map((p) => p.permission.key),
      }))}
    />
  );
}
