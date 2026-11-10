import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { scopedBranchWhere } from "@/lib/branch-context";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput, Pagination } from "@/components/forms/list-controls";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Parents & guardians" };
const PAGE = 30;

export default async function GuardiansPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requirePermission("players.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.GuardianWhereInput = {
    players: { some: { player: { ...(await scopedBranchWhere(user)), archivedAt: null } } },
    ...(sp.q ? { OR: [{ firstName: { contains: sp.q, mode: "insensitive" } }, { lastName: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.guardian.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * PAGE, take: PAGE, include: { players: { include: { player: { select: { id: true, firstName: true, lastName: true, archivedAt: true, ageGroup: { select: { name: true, color: true } } } } } } } }),
    db.guardian.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Parents & guardians" eyebrow="Academy" description={`${total} families. One guardian can be linked to several children.`} />
      <Card>
        <div className="p-4"><SearchInput placeholder="Name, phone or email" /></div>
        {rows.length === 0 ? <EmptyState icon={HeartHandshake} title="No guardians found" /> : (
          <Table>
            <THead><TR><TH>Guardian</TH><TH>Contact</TH><TH>Children</TH><TH>Portal</TH></TR></THead>
            <TBody>
              {rows.map((g) => (
                <TR key={g.id}>
                  <TD className="font-semibold">{g.firstName} {g.lastName}</TD>
                  <TD className="text-sm"><div>{g.phone}</div><div className="text-xs text-muted">{g.email ?? "No email"}</div></TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {g.players.filter((pg) => !pg.player.archivedAt).map((pg) => (
                        <Link key={pg.playerId} href={`/players/${pg.playerId}`} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-surface-2">
                          <span className="size-2 rounded-full" style={{ background: pg.player.ageGroup?.color ?? "#999" }} />
                          {pg.player.firstName} {pg.player.lastName} <span className="text-muted">{pg.relationship}</span>
                        </Link>
                      ))}
                    </div>
                  </TD>
                  <TD>{g.userId ? <Badge tone="brand">Active</Badge> : <Badge>None</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} />
      </Card>
    </div>
  );
}
