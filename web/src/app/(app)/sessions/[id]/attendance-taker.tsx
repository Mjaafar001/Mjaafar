"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, MessageSquare, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { saveAttendance } from "../actions";

type Status = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "INJURED";
export type RosterRow = { playerId: string; name: string; academyId: string; hasPhoto: boolean; color?: string; reason: string | null; credits: number | null; current: { status: Status; version: number; note: string | null } | null };

const OPTIONS: { value: Status; short: string; label: string; cls: string }[] = [
  { value: "PRESENT", short: "P", label: "Present", cls: "data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success" },
  { value: "LATE", short: "L", label: "Late", cls: "data-[on=true]:bg-warning data-[on=true]:text-white data-[on=true]:border-warning" },
  { value: "ABSENT", short: "A", label: "Absent", cls: "data-[on=true]:bg-danger-strong data-[on=true]:text-white data-[on=true]:border-danger-strong" },
  { value: "EXCUSED", short: "E", label: "Excused", cls: "data-[on=true]:bg-info data-[on=true]:text-white data-[on=true]:border-info" },
  { value: "INJURED", short: "I", label: "Injured", cls: "data-[on=true]:bg-foreground data-[on=true]:text-background data-[on=true]:border-foreground" },
];

export function AttendanceTaker({ sessionId, roster, canSave, isCorrection, deductStatuses, allowWithoutCredit }: { sessionId: string; roster: RosterRow[]; canSave: boolean; isCorrection: boolean; deductStatuses: Status[]; allowWithoutCredit: boolean }) {
  const router = useRouter();
  const initial = React.useMemo(() => Object.fromEntries(roster.map((r) => [r.playerId, { status: r.current?.status ?? null, note: r.current?.note ?? "" }])), [roster]);
  const [marks, setMarks] = React.useState<Record<string, { status: Status | null; note: string }>>(initial);
  const [noteOpen, setNoteOpen] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [conflicts, setConflicts] = React.useState<{ playerId: string; currentStatus: Status }[]>([]);
  const [pending, start] = React.useTransition();
  // When fresh server data arrives (after save/refresh), adopt it — but keep unsaved marks
  // for players in conflict so "Keep my marks" still works. (Derived-state pattern, no effect.)
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setMarks((m) => ({ ...initial, ...Object.fromEntries(conflicts.filter((c) => m[c.playerId]).map((c) => [c.playerId, m[c.playerId]!])) }));
  }

  const changed = roster.filter((r) => marks[r.playerId]?.status && (marks[r.playerId]!.status !== (r.current?.status ?? null) || (marks[r.playerId]!.note || "") !== (r.current?.note ?? "")));
  const counts = OPTIONS.map((o) => ({ ...o, n: roster.filter((r) => marks[r.playerId]?.status === o.value).length }));
  const unmarked = roster.filter((r) => !marks[r.playerId]?.status).length;
  const visible = roster.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.academyId.toLowerCase().includes(q.toLowerCase()));

  const set = (id: string, status: Status) => setMarks((m) => ({ ...m, [id]: { status, note: m[id]?.note ?? "" } }));

  const save = (force = false) =>
    start(async () => {
      const entries = (force ? roster.filter((r) => conflicts.some((c) => c.playerId === r.playerId) || changed.includes(r)) : changed).map((r) => ({
        playerId: r.playerId, status: marks[r.playerId]!.status!, note: marks[r.playerId]!.note || null, expectedVersion: r.current?.version ?? null,
      }));
      if (entries.length === 0) return;
      const res = await saveAttendance({ sessionId, entries, reason: reason || undefined, force, method: entries.length > 5 ? "BULK" : "MANUAL" });
      if (!res.ok) return void toast.error(res.error);
      const out = res.data as { saved: number; conflicts: { playerId: string; currentStatus: Status }[]; blocked: { playerId: string; reason: string }[] };
      if (out.conflicts.length) {
        setConflicts(out.conflicts);
        toast.warning(`${out.conflicts.length} player(s) were updated by someone else while you were editing.`);
      } else setConflicts([]);
      if (out.blocked.length) toast.error(`${out.blocked.length} player(s) have no session credits left and couldn't be marked present.`);
      if (out.saved) toast.success(`Saved ${out.saved} player${out.saved === 1 ? "" : "s"}`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {counts.map((c) => <span key={c.value} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"><span className={cn("grid size-5 place-items-center rounded-full text-[10px] text-white", c.value === "PRESENT" ? "bg-success" : c.value === "LATE" ? "bg-warning" : c.value === "ABSENT" ? "bg-danger-strong" : c.value === "EXCUSED" ? "bg-info" : "bg-foreground")}>{c.short}</span>{c.n}</span>)}
        <span className="text-xs text-muted">{unmarked} unmarked · {roster.length} on roster</span>
      </div>

      {conflicts.length ? (
        <Alert tone="warning" title="Someone else saved attendance for this session">
          <p>{conflicts.length} player(s) changed since you opened this page. Their current saved status is shown below each name. Reload to see the latest, or keep your marks.</p>
          <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => router.refresh()}><RotateCcw /> Reload latest</Button><Button size="sm" onClick={() => save(true)} disabled={pending}>Keep my marks</Button></div>
        </Alert>
      ) : null}

      {isCorrection ? (
        <Alert tone="info" title="Correcting past attendance">
          <p className="mb-2">Changes after the session day are recorded in the audit log and adjust session credits automatically.</p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for correction (required)" maxLength={300} className="bg-surface text-foreground" />
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find player" className="pl-9" aria-label="Find player" /></div>
        {canSave ? <Button variant="outline" onClick={() => setMarks((m) => Object.fromEntries(roster.map((r) => [r.playerId, { status: m[r.playerId]?.status ?? "PRESENT", note: m[r.playerId]?.note ?? "" }])))}><CheckCheck /> Mark unmarked present</Button> : null}
      </div>

      <ul className="divide-y rounded-lg border bg-surface">
        {visible.map((r) => {
          const mark = marks[r.playerId];
          const conflict = conflicts.find((c) => c.playerId === r.playerId);
          const noCredit = r.credits !== null && r.credits <= 0;
          const wouldDeduct = mark?.status && deductStatuses.includes(mark.status) && !(r.current && deductStatuses.includes(r.current.status));
          return (
            <li key={r.playerId} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", conflict && "bg-warning-soft/50")}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={r.name} src={r.hasPhoto ? `/api/players/${r.playerId}/photo` : null} size={40} color={r.color} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-mono">{r.academyId}</span>
                    {r.reason ? <Badge tone="info">{r.reason.toLowerCase()}</Badge> : null}
                    {r.credits !== null ? <Badge tone={noCredit ? "danger" : r.credits <= 2 ? "warning" : "neutral"}>{r.credits} credit{Math.abs(r.credits) === 1 ? "" : "s"}</Badge> : null}
                    {conflict ? <Badge tone="warning">Saved by other: {conflict.currentStatus.toLowerCase()}</Badge> : null}
                  </p>
                  {noCredit && wouldDeduct ? <p className="text-xs font-medium text-danger">{allowWithoutCredit ? "No credits left — renewal due" : "No credits left — can't be marked present"}</p> : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {OPTIONS.map((o) => (
                  <button key={o.value} type="button" disabled={!canSave} data-on={mark?.status === o.value} onClick={() => set(r.playerId, o.value)} aria-label={`${o.label}: ${r.name}`} aria-pressed={mark?.status === o.value} title={o.label}
                    className={cn("grid size-11 place-items-center rounded-lg border font-display text-lg font-bold text-muted transition-all active:scale-95 disabled:opacity-60 sm:size-10", o.cls)}>
                    {o.short}
                  </button>
                ))}
                <button type="button" onClick={() => setNoteOpen(noteOpen === r.playerId ? null : r.playerId)} className={cn("grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-10", mark?.note && "text-primary")} aria-label={`Note for ${r.name}`}><MessageSquare className="size-4" /></button>
              </div>
              {noteOpen === r.playerId ? <Input autoFocus className="sm:basis-full" value={mark?.note ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [r.playerId]: { status: m[r.playerId]?.status ?? null, note: e.target.value } }))} placeholder="Note (e.g. left early, felt unwell)" maxLength={300} disabled={!canSave} /> : null}
            </li>
          );
        })}
      </ul>

      {canSave ? (
        <div className="sticky bottom-16 z-10 flex items-center justify-between gap-3 rounded-lg border bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <span className="text-sm text-muted">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "All changes saved"}</span>
          <Button size="lg" onClick={() => save(false)} disabled={pending || changed.length === 0 || (isCorrection && reason.trim().length < 3)}>{pending ? "Saving…" : "Save attendance"}</Button>
        </div>
      ) : null}
    </div>
  );
}
