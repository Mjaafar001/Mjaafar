import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, Repeat, User } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { sessionScope, playerScope } from "@/lib/services/scope";
import { sessionRoster } from "@/lib/services/attendance";
import { creditBalances } from "@/lib/services/credits";
import { localDayBounds, utcToLocalParts } from "@/lib/dates";
import { formatDate, formatDateTime, formatTime, humanize } from "@/lib/utils";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { AttendanceTaker, type RosterRow } from "./attendance-taker";
import { CancelDialog, RescheduleDialog, EditDialog, AddPlayerDialog } from "./session-dialogs";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sessions.view", "attendance.record");
  const { id } = await params;
  const s = await db.trainingSession.findFirst({
    where: { id, ...sessionScope(user) },
    include: { ageGroup: true, venue: true, coach: true, branch: true, recurrence: true, assistants: { include: { staff: true } }, rescheduledFrom: true, attendance: { include: { history: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  if (!s) notFound();
  const roster = await sessionRoster(s);
  const balances = can(user, "credits.view") ? await creditBalances(roster.map((r) => r.player.id)) : null;
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });
  const attByPlayer = new Map(s.attendance.map((a) => [a.playerId, a]));
  // Include players who were marked but have since left the group.
  const rosterIds = new Set(roster.map((r) => r.player.id));
  const formerIds = s.attendance.filter((a) => !rosterIds.has(a.playerId)).map((a) => a.playerId);
  const former = formerIds.length ? await db.player.findMany({ where: { id: { in: formerIds } } }) : [];

  const today = localDayBounds();
  const isPastDay = s.startsAt < today.start;
  const isFuture = s.startsAt >= today.end;
  const canRecord = s.status !== "CANCELLED" && !isFuture && (isPastDay ? can(user, "attendance.correct") : can(user, "attendance.record"));
  const manage = can(user, "sessions.manage");

  const rows: RosterRow[] = [...roster.map((r) => ({ player: r.player, reason: r.reason })), ...former.map((p) => ({ player: p, reason: "left group" }))].map(({ player: p, reason }) => {
    const a = attByPlayer.get(p.id);
    return {
      playerId: p.id, name: `${p.preferredName || p.firstName} ${p.lastName}`, academyId: p.academyId, hasPhoto: !!p.photoKey, color: s.ageGroup?.color, reason,
      credits: balances ? (balances.get(p.id) ?? 0) : null,
      current: a ? { status: a.status, version: a.version, note: a.note } : null,
    };
  });
  const candidates = manage || can(user, "attendance.record")
    ? await db.player.findMany({ where: { ...playerScope(user), branchId: s.branchId, status: { in: ["ACTIVE", "TRIAL"] }, archivedAt: null, id: { notIn: [...rosterIds] } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true, ageGroup: { select: { name: true } } }, take: 500 })
    : [];
  const local = utcToLocalParts(s.startsAt);
  const [coaches, venues] = manage
    ? await Promise.all([
        db.staffProfile.findMany({ where: { branchId: s.branchId, employmentStatus: { in: ["ACTIVE", "PROBATION"] } }, orderBy: { firstName: "asc" } }),
        db.venue.findMany({ where: { branchId: s.branchId, isActive: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={s.title}
        eyebrow={<Link href={`/calendar?date=${local.date}&view=week`} className="hover:underline">← Calendar</Link>}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={s.status} />{s.ageGroup ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.ageGroup.color }} />{s.ageGroup.name}</span> : null}<span>{s.branch.name}</span>{!s.countsTowardCredits ? <Badge>No credit deduction</Badge> : null}</span>}
        actions={manage && s.status !== "CANCELLED" ? (
          <>
            <EditDialog session={{ sessionId: s.id, title: s.title, objectives: s.objectives ?? "", notes: s.notes ?? "", capacity: s.capacity ?? "", countsTowardCredits: s.countsTowardCredits }} />
            {s.status !== "COMPLETED" ? <RescheduleDialog sessionId={s.id} defaults={{ date: local.date, startTime: local.time, durationMinutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000), venueId: s.venueId ?? "", coachId: s.coachId ?? "" }} coaches={coaches.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))} venues={venues.map((v) => ({ value: v.id, label: v.name }))} /> : null}
            <CancelDialog sessionId={s.id} recurring={!!s.recurrenceId} hasAttendance={s.attendance.length > 0} />
          </>
        ) : null}
      />

      {s.status === "CANCELLED" ? <Alert tone="danger" title={`Cancelled — ${humanize(s.cancellationType ?? "OTHER")}`} className="mb-6">{s.cancellationReason}{s.attendance.length ? " Any session credits used were returned." : ""}</Alert> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 pt-5 text-sm">
            <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-muted" /><div><p className="text-xs text-muted">Date</p><p className="font-semibold">{formatDate(s.startsAt, "long")}</p></div></div>
            <div className="flex items-start gap-2"><Clock className="mt-0.5 size-4 text-muted" /><div><p className="text-xs text-muted">Time</p><p className="font-semibold">{formatTime(s.startsAt)}–{formatTime(s.endsAt)} <span className="font-normal text-muted">({Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000)} min)</span></p></div></div>
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-muted" /><div><p className="text-xs text-muted">Venue</p><p className="font-semibold">{s.venue?.name ?? "Not set"}</p></div></div>
            <div className="flex items-start gap-2"><User className="mt-0.5 size-4 text-muted" /><div><p className="text-xs text-muted">Coach</p><p className="font-semibold">{s.coach ? `${s.coach.firstName} ${s.coach.lastName}` : "Not set"}</p>{s.assistants.length ? <p className="text-xs text-muted">with {s.assistants.map((a) => a.staff.firstName).join(", ")}</p> : null}</div></div>
            {s.recurrence ? <div className="col-span-2 flex items-center gap-2 text-xs text-muted"><Repeat className="size-3.5" /> Part of a weekly series until {formatDate(s.recurrence.endDate)}</div> : null}
            {s.capacity ? <div className="col-span-2 text-xs text-muted">Capacity {rows.length}/{s.capacity}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle>Training plan</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {s.objectives ? <p className="whitespace-pre-line">{s.objectives}</p> : <p className="text-muted">No objectives recorded.</p>}
            {s.notes ? <p className="mt-3 rounded-md bg-surface-2 p-2 text-muted">{s.notes}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Attendance</h2>
        {(manage || can(user, "attendance.record")) && s.status !== "CANCELLED" ? <AddPlayerDialog sessionId={s.id} players={candidates.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}${p.ageGroup ? ` (${p.ageGroup.name})` : ""}` }))} /> : null}
      </div>
      {isFuture && s.status !== "CANCELLED" ? <Alert className="mb-4">Attendance opens on the day of the session ({formatDate(s.startsAt)}).</Alert> : null}
      {rows.length === 0 ? <Alert>No players on this session&apos;s roster. Assign an age group or add players.</Alert> : (
        <AttendanceTaker sessionId={s.id} roster={rows} canSave={canRecord} isCorrection={isPastDay} deductStatuses={s.countsTowardCredits ? settings.creditDeductStatuses : []} allowWithoutCredit={settings.allowAttendanceWithoutCredit} />
      )}
      {s.attendance.length ? <p className="mt-3 text-xs text-muted">Last change {formatDateTime(s.attendance.reduce((m, a) => (a.updatedAt > m ? a.updatedAt : m), s.attendance[0]!.updatedAt))}. Every change is kept in the attendance history.</p> : null}
    </div>
  );
}
