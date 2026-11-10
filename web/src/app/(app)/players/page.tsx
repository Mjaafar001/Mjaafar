import type { Metadata } from "next";
import Link from "next/link";
import { Download, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { scopedBranchWhere } from "@/lib/branch-context";
import { creditBalances } from "@/lib/services/credits";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput, FilterSelect, Pagination } from "@/components/forms/list-controls";
import { PLAYER_STATUSES } from "@/lib/validators/player";
import { ageOn } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { playerListQuery, type PlayerListParams } from "./query";
import { PlayersTable } from "./players-table";

export const metadata: Metadata = { title: "Players" };
const PAGE = 25;

export default async function PlayersPage({ searchParams }: { searchParams: Promise<PlayerListParams> }) {
  const user = await requirePermission("players.view", "players.view.assigned");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { where, orderBy } = await playerListQuery(user, sp);
  const [players, total, groups] = await Promise.all([
    db.player.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { ageGroup: true, branch: { select: { code: true } }, guardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 } } }),
    db.player.count({ where }),
    db.ageGroup.findMany({ where: { ...(await scopedBranchWhere(user)), isActive: true }, orderBy: [{ branch: { name: "asc" } }, { sortOrder: "asc" }], include: { branch: { select: { code: true } } } }),
  ]);
  const balances = can(user, "credits.view") ? await creditBalances(players.map((p) => p.id)) : null;
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        title="Players"
        eyebrow="Academy"
        description={`${total} player${total === 1 ? "" : "s"}${sp.archived === "1" ? " in the archive" : ""}`}
        actions={
          <>
            {can(user, "players.export") ? <Button variant="outline" asChild><a href={`/api/players/export?${exportQs}`}><Download /> Export CSV</a></Button> : null}
            {can(user, "players.create") ? <Button asChild><Link href="/players/new"><UserPlus /> Register player</Link></Button> : null}
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput placeholder="Name, academy ID or parent phone" />
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={PLAYER_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
          <FilterSelect param="group" label="Age group" allLabel="All age groups" options={groups.map((g) => ({ value: g.id, label: `${g.name} · ${g.branch.code}` }))} />
          <FilterSelect param="archived" label="Archive" allLabel="Current players" options={[{ value: "1", label: "Archived" }]} />
        </div>
        {players.length === 0 ? (
          <EmptyState icon={Users} title="No players found" description={sp.q || sp.status || sp.group ? "Try clearing the filters." : "Registered players will appear here."} />
        ) : (
          <PlayersTable
            canBulk={can(user, "players.update")}
            groups={groups.map((g) => ({ id: g.id, name: `${g.name} · ${g.branch.code}` }))}
            rows={players.map((p) => ({
              id: p.id, academyId: p.academyId, name: `${p.preferredName || p.firstName} ${p.lastName}`, hasPhoto: !!p.photoKey,
              age: ageOn(p.dateOfBirth), status: p.status, group: p.ageGroup ? { name: p.ageGroup.name, color: p.ageGroup.color } : null, branch: p.branch.code,
              position: p.preferredPosition, guardian: p.guardians[0] ? `${p.guardians[0].guardian.firstName} ${p.guardians[0].guardian.lastName}` : null,
              guardianPhone: p.guardians[0]?.guardian.phone ?? null, credits: balances ? (balances.get(p.id) ?? null) : undefined,
            }))}
          />
        )}
        <Pagination page={page} pageSize={PAGE} total={total} />
      </Card>
    </div>
  );
}
