import type { Metadata } from "next";
import Link from "next/link";
import { CheckSquare, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { sessionScope } from "@/lib/services/scope";
import { scopedBranchWhere } from "@/lib/branch-context";
import { attendanceReport } from "@/lib/services/attendance-report";
import { addDaysToDateString, localDayBounds, utcToLocalParts } from "@/lib/dates";
import { formatTime, cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FilterSelect } from "@/components/forms/list-controls";
import { ReportRange } from "./report-range";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const user = await requirePermission("attendance.view", "attendance.record");
  const sp = await searchParams;
  const today = utcToLocalParts(new Date()).date;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const { start, end } = localDayBounds();
  const branchFilter = await scopedBranchWhere(user);
  const [todays, groups, report] = await Promise.all([
    db.trainingSession.findMany({ where: { AND: [sessionScope(user), branchFilter, { startsAt: { gte: start, lt: end } }] }, orderBy: { startsAt: "asc" }, include: { ageGroup: { include: { _count: { select: { players: { where: { status: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null } } } } } }, venue: true, coach: true, _count: { select: { attendance: true, extraPlayers: true } } } }),
    db.ageGroup.findMany({ where: { ...branchFilter, isActive: true }, orderBy: { sortOrder: "asc" } }),
    attendanceReport(user, { from, to, ageGroupId: sp.group }),
  ]);
  const withData = report.filter((r) => r.total > 0);
  const overall = withData.length ? Math.round(withData.reduce((a, r) => a + (r.present + r.late), 0) / withData.reduce((a, r) => a + r.total, 0) * 100) : null;
  const qs = new URLSearchParams({ from, to, ...(sp.group ? { group: sp.group } : {}) }).toString();

  return (
    <div>
      <PageHeader title="Attendance" eyebrow="Training" description="Take today's registers and review attendance trends." />
      <h2 className="mb-3 font-display text-xl font-semibold uppercase">Today</h2>
      {todays.length === 0 ? <Card className="mb-8"><EmptyState icon={CheckSquare} title="No sessions today" description="Sessions scheduled for today will appear here." action={<Button variant="outline" asChild><Link href="/calendar">Open calendar</Link></Button>} /></Card> : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {todays.map((s) => {
            const expected = (s.ageGroup?._count.players ?? 0) + s._count.extraPlayers;
            const done = s._count.attendance;
            const pctDone = expected ? Math.min(100, Math.round((done / expected) * 100)) : 0;
            return (
              <Link key={s.id} href={`/sessions/${s.id}`} className={cn("rounded-xl border bg-surface p-4 transition-shadow hover:shadow-lg", s.status === "CANCELLED" && "opacity-60")} style={{ borderTop: `4px solid ${s.ageGroup?.color ?? "var(--brand)"}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-display text-lg font-semibold uppercase">{s.title}</p><p className="text-sm text-muted">{formatTime(s.startsAt)}–{formatTime(s.endsAt)} · {s.venue?.name ?? "No venue"}</p></div>
                  <StatusBadge status={s.status} />
                </div>
                {s.status !== "CANCELLED" ? (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{s.coach ? `${s.coach.firstName} ${s.coach.lastName}` : "No coach"}</span><span className="font-semibold">{done}/{expected} marked</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pctDone}%` }} /></div>
                    <Button size="sm" className="mt-3 w-full">{done ? "Continue register" : "Take attendance"}</Button>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <div><CardTitle>Attendance report</CardTitle><CardDescription>Present + late counts as attended. Cancelled sessions are excluded. {overall != null ? <>Overall rate: <strong className="text-foreground">{overall}%</strong></> : null}</CardDescription></div>
          <Button variant="outline" size="sm" asChild><a href={`/api/attendance/export?${qs}`}><Download /> Export CSV</a></Button>
        </CardHeader>
        <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end">
          <ReportRange from={from} to={to} presets={{ month: [today.slice(0, 8) + "01", today], last30: [addDaysToDateString(today, -29), today] }} />
          <FilterSelect param="group" label="Age group" allLabel="All age groups" options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </div>
        {report.length === 0 ? <EmptyState icon={CheckSquare} title="No players" /> : (
          <Table>
            <THead><TR><TH>Player</TH><TH>Group</TH><TH className="text-right">Present</TH><TH className="text-right">Late</TH><TH className="text-right">Absent</TH><TH className="text-right">Excused</TH><TH className="text-right">Injured</TH><TH className="text-right">Rate</TH></TR></THead>
            <TBody>
              {report.map((r) => (
                <TR key={r.player.id}>
                  <TD><Link href={`/players/${r.player.id}`} className="font-semibold hover:text-primary">{r.player.firstName} {r.player.lastName}</Link></TD>
                  <TD className="text-sm text-muted">{r.player.ageGroup?.name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{r.present}</TD>
                  <TD className="text-right tabular-nums">{r.late}</TD>
                  <TD className="text-right tabular-nums">{r.absent}</TD>
                  <TD className="text-right tabular-nums">{r.excused}</TD>
                  <TD className="text-right tabular-nums">{r.injured}</TD>
                  <TD className="text-right">{r.rate == null ? <span className="text-muted">—</span> : <Badge tone={r.rate >= 80 ? "success" : r.rate >= 60 ? "warning" : "danger"} className="tabular-nums">{r.rate}%</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
