import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission, branchWhere } from "@/lib/rbac/authorize";
import { accessibleBranches } from "@/lib/branch-context";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AgeGroupDialog, MergeDialog } from "./age-group-dialogs";

export const metadata: Metadata = { title: "Age groups" };

export default async function AgeGroupsPage() {
  const user = await requirePermission("agegroups.manage");
  const [groups, branches] = await Promise.all([
    db.ageGroup.findMany({
      where: branchWhere(user),
      orderBy: [{ branch: { name: "asc" } }, { isActive: "desc" }, { sortOrder: "asc" }],
      include: { branch: true, mergedInto: true, _count: { select: { players: { where: { status: { in: ["ACTIVE", "TRIAL", "PENDING"] }, archivedAt: null } }, staff: true } } },
    }),
    accessibleBranches(user),
  ]);
  const branchOpts = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Age is measured on the academy&apos;s cutoff date. &quot;Under-N&quot; means younger than N on that date.</p>
        <div className="flex gap-2">
          <MergeDialog groups={groups.filter((g) => g.isActive).map((g) => ({ id: g.id, name: `${g.name} · ${g.branch.code}`, branchId: g.branchId }))} />
          <AgeGroupDialog branches={branchOpts} />
        </div>
      </div>
      <Table>
        <THead>
          <TR><TH>Group</TH><TH>Branch</TH><TH>Ages</TH><TH>Players / capacity</TH><TH>Coaches</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR>
        </THead>
        <TBody>
          {groups.map((g) => {
            const full = g.capacity != null && g._count.players >= g.capacity;
            return (
              <TR key={g.id} className={g.isActive ? "" : "opacity-60"}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <span className="size-3 rounded-full" style={{ background: g.color }} />
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-xs text-muted">{g.code}</span>
                  </div>
                </TD>
                <TD className="text-muted">{g.branch.name}</TD>
                <TD className="tabular-nums">{g.minAge ?? "—"} to {g.maxAgeExclusive != null ? `<${g.maxAgeExclusive}` : "—"}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{g._count.players}{g.capacity ? ` / ${g.capacity}` : ""}</span>
                    {g.capacity ? (
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                        <span className={`block h-full ${full ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(100, (g._count.players / g.capacity) * 100)}%` }} />
                      </span>
                    ) : null}
                    {full ? <Badge tone="danger">Full</Badge> : null}
                  </div>
                </TD>
                <TD className="tabular-nums">{g._count.staff}</TD>
                <TD>{g.isActive ? <Badge tone="success">Active</Badge> : g.mergedInto ? <Badge>Merged → {g.mergedInto.name}</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD className="text-right">
                  <AgeGroupDialog
                    branches={branchOpts}
                    group={{ id: g.id, branchId: g.branchId, name: g.name, code: g.code, description: g.description ?? "", minAge: g.minAge ?? "", maxAgeExclusive: g.maxAgeExclusive ?? "", capacity: g.capacity ?? "", color: g.color, sortOrder: g.sortOrder, isActive: g.isActive }}
                  />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
