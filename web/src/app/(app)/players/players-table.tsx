"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { SortHeader } from "@/components/forms/list-controls";
import { PLAYER_STATUSES } from "@/lib/validators/player";
import { humanize } from "@/lib/utils";
import { bulkUpdatePlayers } from "./actions";

type Row = { id: string; academyId: string; name: string; hasPhoto: boolean; age: number; status: string; group: { name: string; color: string } | null; branch: string; position: string | null; guardian: string | null; guardianPhone: string | null; credits?: number | null };

export function CreditPill({ value }: { value: number | null | undefined }) {
  if (value === undefined) return null;
  if (value === null) return <span className="text-muted">—</span>;
  return <Badge tone={value <= 0 ? "danger" : value <= 2 ? "warning" : "success"} className="tabular-nums">{value} left</Badge>;
}

export function PlayersTable({ rows, canBulk, groups }: { rows: Row[]; canBulk: boolean; groups: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [pending, start] = React.useTransition();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const showCredits = rows.some((r) => r.credits !== undefined);

  const apply = () =>
    start(async () => {
      const res = await bulkUpdatePlayers({ ids: [...selected], status: status || undefined, ageGroupId: group || undefined });
      if (res.ok) { toast.success(res.message); setSelected(new Set()); setStatus(""); setGroup(""); router.refresh(); } else toast.error(res.error);
    });

  return (
    <>
      {canBulk && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y bg-primary-soft px-4 py-2.5 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40" aria-label="New status"><option value="">Set status…</option>{PLAYER_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</NativeSelect>
          <NativeSelect value={group} onChange={(e) => setGroup(e.target.value)} className="h-9 w-48" aria-label="New age group"><option value="">Move to age group…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
          <Button size="sm" onClick={apply} disabled={pending || (!status && !group)}>Apply</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}
      <Table>
        <THead>
          <TR>
            {canBulk ? <TH className="w-10"><Checkbox aria-label="Select all" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} /></TH> : null}
            <TH><SortHeader field="name" label="Player" /></TH>
            <TH><SortHeader field="id" label="Academy ID" /></TH>
            <TH><SortHeader field="dob" label="Age" /></TH>
            <TH>Group</TH>
            <TH className="hidden xl:table-cell">Position</TH>
            <TH className="hidden md:table-cell">Parent / guardian</TH>
            {showCredits ? <TH>Sessions</TH> : null}
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} className={selected.has(r.id) ? "bg-primary-soft/50" : ""}>
              {canBulk ? <TD><Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => { const n = new Set(selected); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelected(n); }} /></TD> : null}
              <TD>
                <Link href={`/players/${r.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                  <Avatar name={r.name} src={r.hasPhoto ? `/api/players/${r.id}/photo` : null} size={34} color={r.group?.color} />
                  {r.name}
                </Link>
              </TD>
              <TD className="font-mono text-xs text-muted">{r.academyId}</TD>
              <TD className="tabular-nums">{r.age}</TD>
              <TD>{r.group ? <span className="inline-flex items-center gap-1.5 text-sm"><span className="size-2 rounded-full" style={{ background: r.group.color }} />{r.group.name}<span className="text-xs text-muted">{r.branch}</span></span> : <span className="text-muted">Unassigned</span>}</TD>
              <TD className="hidden text-sm text-muted xl:table-cell">{r.position ?? "—"}</TD>
              <TD className="hidden text-sm md:table-cell">{r.guardian ? <><div>{r.guardian}</div><div className="text-xs text-muted">{r.guardianPhone}</div></> : "—"}</TD>
              {showCredits ? <TD><CreditPill value={r.credits} /></TD> : null}
              <TD><StatusBadge status={r.status} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
