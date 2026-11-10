import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Plus, Ticket, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { playerScope, sessionScope } from "@/lib/services/scope";
import { scopedBranchWhere } from "@/lib/branch-context";
import { playersWithLowCredits } from "@/lib/services/credits";
import { addDaysToDateString, daysFromNow, localDayBounds, localToUtc, utcToLocalParts } from "@/lib/dates";
import { formatDate, formatTime, pct } from "@/lib/utils";
import { PageHeader, StatCard, EmptyState, Avatar } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EnrollmentChart, AttendanceChart, GroupChart } from "./charts";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const branchFilter = await scopedBranchWhere(user);
  const pScope: Prisma.PlayerWhereInput = { AND: [playerScope(user), branchFilter, { archivedAt: null }] };
  const sScope: Prisma.TrainingSessionWhereInput = { AND: [sessionScope(user), branchFilter] };
  const { start, end } = localDayBounds();
  const today = utcToLocalParts(new Date()).date;
  const isCoachView = !can(user, "players.view");

  // 12-month enrollment and 8-week attendance trends.
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); monthKeys.push(d.toISOString().slice(0, 7)); }
  const weekStart = addDaysToDateString(today, -55);

  const [activePlayers, pendingRegs, todaySessions, todayAttendance, upcomingCount, registrations, recentPlayers, weekAttendance, groups, lowCredits, recentSessions] = await Promise.all([
    db.player.count({ where: { AND: [pScope, { status: "ACTIVE" }] } }),
    can(user, "registrations.view") ? db.registration.findMany({ where: { ...branchFilter, status: { in: ["SUBMITTED", "UNDER_REVIEW", "TRIAL_SCHEDULED"] } }, orderBy: { createdAt: "desc" }, take: 5, include: { requestedAgeGroup: true } }) : Promise.resolve([]),
    db.trainingSession.findMany({ where: { AND: [sScope, { startsAt: { gte: start, lt: end } }] }, orderBy: { startsAt: "asc" }, include: { ageGroup: true, venue: true, coach: true, _count: { select: { attendance: true } } } }),
    db.attendance.groupBy({ by: ["status"], where: { session: { AND: [sScope, { startsAt: { gte: start, lt: end } }] } }, _count: true }),
    db.trainingSession.count({ where: { AND: [sScope, { startsAt: { gte: daysFromNow(0), lt: daysFromNow(7) } }, { status: "SCHEDULED" }] } }),
    can(user, "registrations.view") ? db.registration.count({ where: { ...branchFilter, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }) : Promise.resolve(0),
    db.player.findMany({ where: { AND: [playerScope(user), branchFilter] }, select: { registrationDate: true, archivedAt: true, status: true } }),
    db.attendance.findMany({ where: { session: { AND: [sScope, { startsAt: { gte: localToUtc(weekStart, "00:00") } }, { status: { not: "CANCELLED" } }] } }, select: { status: true, session: { select: { startsAt: true } } } }),
    db.ageGroup.findMany({ where: { ...branchFilter, isActive: true, ...(isCoachView && user.staffId ? { staff: { some: { staffId: user.staffId } } } : {}) }, orderBy: { sortOrder: "asc" }, include: { branch: { select: { code: true } }, _count: { select: { players: { where: { status: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null } } } } } }),
    can(user, "credits.view") ? playersWithLowCredits(branchFilter as { branchId?: { in: string[] } }, 0) : Promise.resolve([]),
    db.trainingSession.findMany({ where: { AND: [sScope, { status: "COMPLETED" }, { startsAt: { lt: start } }] }, orderBy: { startsAt: "desc" }, take: 5, include: { ageGroup: true, attendance: { select: { status: true } } } }),
  ]);
  // Coaches only see low-credit players in their own scope.
  const visibleLow = isCoachView ? (await db.player.findMany({ where: { AND: [pScope, { id: { in: lowCredits.map((l) => l.player.id) } }] }, select: { id: true } })).map((p) => p.id) : null;
  const exhausted = visibleLow ? lowCredits.filter((l) => visibleLow.includes(l.player.id)) : lowCredits;

  const enrollment = monthKeys.map((m) => {
    const endOfMonth = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1));
    return {
      month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(m + "-01")),
      total: recentPlayers.filter((p) => p.registrationDate < endOfMonth && (!p.archivedAt || p.archivedAt >= endOfMonth)).length,
      added: recentPlayers.filter((p) => p.registrationDate.toISOString().slice(0, 7) === m).length,
    };
  });
  const weeks = Array.from({ length: 8 }, (_, i) => addDaysToDateString(weekStart, i * 7));
  const attendanceTrend = weeks.map((w) => {
    const ws = localToUtc(w, "00:00").getTime();
    const we = ws + 7 * 86400000;
    const rows = weekAttendance.filter((a) => a.session.startsAt.getTime() >= ws && a.session.startsAt.getTime() < we);
    const attended = rows.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    return { week: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(w)), rate: pct(attended, rows.length), sessions: rows.length };
  });
  const tCount = (s: string) => todayAttendance.find((a) => a.status === s)?._count ?? 0;
  const todayMarked = todayAttendance.reduce((a, r) => a + r._count, 0);
  const todayRate = pct(tCount("PRESENT") + tCount("LATE"), todayMarked);
  const firstName = user.name.split(" ")[0];
  const greeting = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date());
  const hour = Number(greeting);

  return (
    <div>
      <PageHeader
        title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${firstName}`}
        eyebrow={formatDate(new Date(), "long")}
        description={isCoachView ? "Your sessions and players at a glance." : "Here's how the academy is doing today."}
        actions={
          <>
            {can(user, "players.create") ? <Button variant="outline" asChild><Link href="/players/new"><UserPlus /> Register player</Link></Button> : null}
            {can(user, "sessions.manage") ? <Button variant="outline" asChild><Link href="/sessions/new"><Plus /> New session</Link></Button> : null}
            {can(user, "attendance.record") ? <Button asChild><Link href="/attendance"><CheckCircle2 /> Take attendance</Link></Button> : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={isCoachView ? "My players" : "Active players"} value={activePlayers} icon={Users} href="/players?status=ACTIVE" hint={`${groups.length} age groups`} />
        <StatCard label="Today's sessions" value={todaySessions.filter((s) => s.status !== "CANCELLED").length} icon={CalendarDays} tone="info" href="/attendance" hint={todaySessions.some((s) => s.status === "CANCELLED") ? `${todaySessions.filter((s) => s.status === "CANCELLED").length} cancelled` : "Scheduled today"} />
        <StatCard label="Today's attendance" value={todayRate == null ? "—" : `${todayRate}%`} icon={CheckCircle2} tone="success" hint={todayMarked ? `${tCount("PRESENT") + tCount("LATE")} of ${todayMarked} marked` : "No registers yet"} />
        <StatCard label="Next 7 days" value={upcomingCount} icon={CalendarDays} tone="brand" href="/calendar?view=week" hint="Upcoming sessions" />
        {can(user, "registrations.view") ? <StatCard label="Pending applications" value={registrations} icon={ClipboardList} tone="warning" href="/registrations" hint="Awaiting review" /> : null}
        {can(user, "credits.view") ? <StatCard label="Sessions exhausted" value={exhausted.length} icon={Ticket} tone={exhausted.length ? "danger" : "success"} hint="Players needing renewal" /> : null}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><div><CardTitle>Today&apos;s schedule</CardTitle><CardDescription>{formatDate(new Date(), "long")}</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/calendar">Calendar →</Link></Button></CardHeader>
          {todaySessions.length === 0 ? <EmptyState icon={CalendarDays} title="No training today" /> : (
            <ul className="divide-y">
              {todaySessions.map((s) => (
                <li key={s.id}><Link href={`/sessions/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                  <div className="w-14 text-center"><div className="font-display text-xl font-bold leading-none">{formatTime(s.startsAt)}</div><div className="text-[11px] text-muted">{Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000)} min</div></div>
                  <span className="h-10 w-1 rounded-full" style={{ background: s.ageGroup?.color ?? "var(--brand)" }} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{s.title}</p><p className="truncate text-sm text-muted">{s.venue?.name ?? "No venue"} · {s.coach ? `${s.coach.firstName} ${s.coach.lastName}` : "No coach"}</p></div>
                  {s.status === "CANCELLED" ? <StatusBadge status="CANCELLED" /> : s._count.attendance ? <Badge tone="success">{s._count.attendance} marked</Badge> : <Badge tone="warning">Register open</Badge>}
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Players by age group</CardTitle><CardDescription>Active and trial players</CardDescription></div></CardHeader>
          <CardContent>{groups.length ? <GroupChart data={groups.map((g) => ({ name: user.branchIds?.length === 1 ? g.name : `${g.code} · ${g.branch.code}`, players: g._count.players, capacity: g.capacity }))} /> : <p className="text-sm text-muted">No age groups.</p>}</CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Enrollment</CardTitle><CardDescription>Players on the books, last 12 months</CardDescription></div><span className="text-sm text-muted">+{enrollment.at(-1)?.added ?? 0} this month</span></CardHeader>
          <CardContent><EnrollmentChart data={enrollment} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Attendance trend</CardTitle><CardDescription>Weekly attendance rate, last 8 weeks</CardDescription></div></CardHeader>
          <CardContent><AttendanceChart data={attendanceTrend} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {can(user, "credits.view") ? (
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-danger" /> Renewal needed</CardTitle><CardDescription>Players with no session credits left</CardDescription></div></CardHeader>
            {exhausted.length === 0 ? <EmptyState icon={Ticket} title="Everyone has sessions left" /> : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {exhausted.slice(0, 20).map(({ player: p, balance }) => (
                  <li key={p.id}><Link href={`/players/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                    <Avatar name={`${p.firstName} ${p.lastName}`} size={30} color={p.ageGroup?.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.firstName} {p.lastName}<span className="block text-xs text-muted">{p.ageGroup?.name}</span></span>
                    <Badge tone="danger" className="tabular-nums">{balance}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
        {can(user, "registrations.view") ? (
          <Card>
            <CardHeader><div><CardTitle>Pending applications</CardTitle><CardDescription>Newest first</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/registrations">All →</Link></Button></CardHeader>
            {pendingRegs.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing to review" /> : (
              <ul className="divide-y">{pendingRegs.map((r) => (
                <li key={r.id}><Link href={`/registrations/${r.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-surface-2">
                  <span className="text-sm"><span className="font-medium">{r.childFirstName} {r.childLastName}</span><span className="block text-xs text-muted">{r.requestedAgeGroup?.name ?? "No group"} · {formatDate(r.createdAt, "short")}</span></span>
                  <StatusBadge status={r.status} />
                </Link></li>
              ))}</ul>
            )}
          </Card>
        ) : null}
        <Card>
          <CardHeader><div><CardTitle>Recent sessions</CardTitle><CardDescription>Latest completed registers</CardDescription></div></CardHeader>
          {recentSessions.length === 0 ? <EmptyState icon={CheckCircle2} title="No completed sessions yet" /> : (
            <ul className="divide-y">{recentSessions.map((s) => {
              const att = s.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
              const r = pct(att, s.attendance.length);
              return (
                <li key={s.id}><Link href={`/sessions/${s.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-surface-2">
                  <span className="flex items-center gap-2 text-sm"><span className="size-2 rounded-full" style={{ background: s.ageGroup?.color ?? "var(--brand)" }} /><span><span className="font-medium">{s.title}</span><span className="block text-xs text-muted">{formatDate(s.startsAt, "short")} · {formatTime(s.startsAt)}</span></span></span>
                  <span className="text-right text-sm"><span className="font-semibold tabular-nums">{r ?? "—"}%</span><span className="block text-xs text-muted">{att}/{s.attendance.length}</span></span>
                </Link></li>
              );
            })}</ul>
          )}
        </Card>
      </div>
      {can(user, "billing.view") ? <p className="mt-6 text-xs text-muted">Revenue, outstanding balances and payment reminders are added to this dashboard in Phase 3 (Payments).</p> : null}
    </div>
  );
}
