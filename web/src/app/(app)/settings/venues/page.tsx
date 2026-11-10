import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission, branchWhere } from "@/lib/rbac/authorize";
import { accessibleBranches } from "@/lib/branch-context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { toDateInput } from "@/lib/dates";
import { VenueDialog, SeasonDialog } from "./dialogs";

export const metadata: Metadata = { title: "Venues & seasons" };

export default async function VenuesPage() {
  const user = await requirePermission("settings.manage");
  const [venues, seasons, branches] = await Promise.all([
    db.venue.findMany({ where: branchWhere(user), orderBy: [{ branch: { name: "asc" } }, { name: "asc" }], include: { branch: true } }),
    db.season.findMany({ orderBy: { startDate: "desc" } }),
    accessibleBranches(user),
  ]);
  const branchOpts = branches.map((b) => ({ value: b.id, label: b.name }));
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>Training venues</CardTitle><VenueDialog branches={branchOpts} /></CardHeader>
        <Table>
          <THead><TR><TH>Venue</TH><TH>Branch</TH><TH>Surface</TH><TH>Capacity</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {venues.map((v) => (
              <TR key={v.id}>
                <TD><div className="font-semibold">{v.name}</div><div className="text-xs text-muted">{v.address}</div></TD>
                <TD className="text-muted">{v.branch.name}</TD>
                <TD>{v.surface ?? "—"}</TD>
                <TD className="tabular-nums">{v.capacity ?? "—"}</TD>
                <TD>{v.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD className="text-right"><VenueDialog branches={branchOpts} venue={{ id: v.id, branchId: v.branchId, name: v.name, address: v.address ?? "", surface: v.surface ?? "", capacity: v.capacity ?? "", isActive: v.isActive }} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Training seasons</CardTitle><SeasonDialog /></CardHeader>
        <Table>
          <THead><TR><TH>Season</TH><TH>Starts</TH><TH>Ends</TH><TH /><TH /></TR></THead>
          <TBody>
            {seasons.map((s) => (
              <TR key={s.id}>
                <TD className="font-semibold">{s.name}</TD>
                <TD>{formatDate(s.startDate)}</TD>
                <TD>{formatDate(s.endDate)}</TD>
                <TD>{s.isCurrent ? <Badge tone="brand">Current</Badge> : null}</TD>
                <TD className="text-right"><SeasonDialog season={{ id: s.id, name: s.name, startDate: toDateInput(s.startDate), endDate: toDateInput(s.endDate), isCurrent: s.isCurrent }} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
