import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput, FilterSelect, Pagination } from "@/components/forms/list-controls";
import { formatDateTime } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; page?: string }> }) {
  const user = await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(user.branchIds !== null ? { OR: [{ branchId: { in: user.branchIds } }, { actorId: user.id }] } : {}),
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.q ? { AND: [{ OR: [{ action: { contains: sp.q, mode: "insensitive" } }, { summary: { contains: sp.q, mode: "insensitive" } }, { actor: { name: { contains: sp.q, mode: "insensitive" } } }] }] } : {}),
  };
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { actor: { select: { name: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <SearchInput placeholder="Search action, person or summary" />
        <FilterSelect param="entity" label="Record type" allLabel="All records" options={entities.map((e) => ({ value: e.entityType, label: e.entityType }))} />
      </div>
      <Table>
        <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Record</TH><TH>Details</TH><TH>IP</TH></TR></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="whitespace-nowrap text-sm text-muted">{formatDateTime(r.createdAt)}</TD>
              <TD className="text-sm font-medium">{r.actor?.name ?? "System"}</TD>
              <TD><Badge tone={r.action.includes("failed") ? "danger" : r.action.startsWith("auth") ? "info" : "brand"}>{r.action}</Badge></TD>
              <TD className="text-xs text-muted">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(-8)}` : ""}</TD>
              <TD className="max-w-md text-sm">{r.summary ?? (r.after ? <details><summary className="cursor-pointer text-muted">View change</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre></details> : "—")}</TD>
              <TD className="text-xs text-muted">{r.ip ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pagination page={page} pageSize={PAGE} total={total} />
    </Card>
  );
}
