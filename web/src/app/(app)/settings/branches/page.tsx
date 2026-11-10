import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BranchDialog } from "./branch-dialog";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  await requirePermission("branches.manage");
  const branches = await db.branch.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: { where: { status: "ACTIVE", archivedAt: null } }, staff: { where: { employmentStatus: "ACTIVE" } }, venues: true } } },
  });
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Each branch has its own players, coaches, venues and schedules. Branch administrators only see their branch.</p>
        <BranchDialog />
      </div>
      <Table>
        <THead><TR><TH>Branch</TH><TH>Code</TH><TH>Location</TH><TH>Active players</TH><TH>Staff</TH><TH>Venues</TH><TH>Status</TH><TH /></TR></THead>
        <TBody>
          {branches.map((b) => (
            <TR key={b.id}>
              <TD className="font-semibold">{b.name}</TD>
              <TD><Badge tone="outline">{b.code}</Badge></TD>
              <TD className="text-muted">{[b.city, b.state].filter(Boolean).join(", ") || "—"}</TD>
              <TD className="tabular-nums">{b._count.players}</TD>
              <TD className="tabular-nums">{b._count.staff}</TD>
              <TD className="tabular-nums">{b._count.venues}</TD>
              <TD>{b.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
              <TD className="text-right">
                <BranchDialog branch={{ id: b.id, name: b.name, code: b.code, address: b.address ?? "", city: b.city ?? "", state: b.state ?? "", phone: b.phone ?? "", email: b.email ?? "", isActive: b.isActive }} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
