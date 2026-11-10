import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { accessibleBranches } from "@/lib/branch-context";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { SearchInput, FilterSelect, Pagination } from "@/components/forms/list-controls";
import { formatDateTime } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { UserDialog, PasswordLinkButton } from "./user-dialog";

export const metadata: Metadata = { title: "Users" };
const PAGE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const actor = await requirePermission("users.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.UserWhereInput = {
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
    ...(sp.role ? { roles: { some: { role: { key: sp.role } } } } : {}),
    // Branch-limited admins only see users with a role in their branches.
    ...(actor.branchIds !== null ? { roles: { some: { branchId: { in: actor.branchIds } } } } : {}),
  };
  const [users, total, roles, branches] = await Promise.all([
    db.user.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE, take: PAGE, include: { roles: { include: { role: true, branch: true } } } }),
    db.user.count({ where }),
    db.role.findMany({ orderBy: { rank: "desc" } }),
    accessibleBranches(actor),
  ]);
  const grantable = roles.filter((r) => r.rank < actor.maxRank || actor.maxRank >= 100).map((r) => ({ value: r.id, label: r.name }));
  const branchOpts = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search name or email" />
        <FilterSelect param="role" label="Role" allLabel="All roles" options={roles.map((r) => ({ value: r.key, label: r.name }))} />
        <div className="flex-1" />
        <UserDialog roles={grantable} branches={branchOpts} allowAllBranches={actor.branchIds === null} />
      </div>
      <Table>
        <THead><TR><TH>User</TH><TH>Roles</TH><TH>2FA</TH><TH>Last sign-in</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
        <TBody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD><div className="flex items-center gap-3"><Avatar name={u.name} size={32} /><div><div className="font-semibold">{u.name}</div><div className="text-xs text-muted">{u.email}</div></div></div></TD>
              <TD><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.id} tone="brand">{r.role.name}{r.branch ? ` · ${r.branch.code}` : ""}</Badge>)}</div></TD>
              <TD>{u.mfaEnabled ? <Badge tone="success">On</Badge> : u.roles.some((r) => r.role.privileged) ? <Badge tone="warning">Required</Badge> : <Badge>Off</Badge>}</TD>
              <TD className="text-sm text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : u.passwordHash ? "Never" : "Invite pending"}</TD>
              <TD>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-1">
                  <PasswordLinkButton userId={u.id} />
                  <UserDialog roles={grantable} branches={branchOpts} allowAllBranches={actor.branchIds === null}
                    user={{ id: u.id, name: u.name, email: u.email, phone: u.phone ?? "", isActive: u.isActive, roles: u.roles.map((r) => ({ roleId: r.roleId, branchId: r.branchId ?? "" })) }} />
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pagination page={page} pageSize={PAGE} total={total} />
    </Card>
  );
}
