import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { sessionScope } from "@/lib/services/scope";
import { scopedBranchWhere } from "@/lib/branch-context";
import { addDaysToDateString, localToUtc, parseDateOnly, utcToLocalParts } from "@/lib/dates";
import { formatTime, cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterSelect } from "@/components/forms/list-controls";
import { HolidayDialog } from "./holiday-dialog";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Calendar" };
type View = "month" | "week" | "day";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayOf(date: string) {
  const dow = parseDateOnly(date).getUTCDay(); // 0 Sun
  return addDaysToDateString(date, -((dow + 6) % 7));
}
function label(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(parseDateOnly(date));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; group?: string; coach?: string; venue?: string }> }) {
  const user = await requirePermission("sessions.view");
  const sp = await searchParams;
  const view: View = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const today = utcToLocalParts(new Date()).date;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  let from: string, to: string, prev: string, next: string, title: string;
  if (view === "month") {
    const first = date.slice(0, 8) + "01";
    from = mondayOf(first);
    const d = parseDateOnly(first);
    const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    to = addDaysToDateString(mondayOf(addDaysToDateString(nextMonth, -1)), 7);
    prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    next = nextMonth;
    title = label(first, { month: "long", year: "numeric" });
  } else if (view === "week") {
    from = mondayOf(date);
    to = addDaysToDateString(from, 7);
    prev = addDaysToDateString(from, -7);
    next = to;
    title = `${label(from, { day: "numeric", month: "short" })} – ${label(addDaysToDateString(to, -1), { day: "numeric", month: "short", year: "numeric" })}`;
  } else {
    from = date;
    to = addDaysToDateString(date, 1);
    prev = addDaysToDateString(date, -1);
    next = to;
    title = label(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const branchFilter = await scopedBranchWhere(user);
  const where: Prisma.TrainingSessionWhereInput = {
    AND: [sessionScope(user), branchFilter, { startsAt: { gte: localToUtc(from, "00:00"), lt: localToUtc(to, "00:00") } }, sp.group ? { ageGroupId: sp.group } : {}, sp.coach ? { coachId: sp.coach } : {}, sp.venue ? { venueId: sp.venue } : {}],
  };
  const [sessions, groups, coaches, venues, holidays] = await Promise.all([
    db.trainingSession.findMany({ where, orderBy: { startsAt: "asc" }, include: { ageGroup: true, venue: true, coach: true, _count: { select: { attendance: true } } } }),
    db.ageGroup.findMany({ where: { ...branchFilter, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.staffProfile.findMany({ where: { ...branchFilter, employmentStatus: { not: "TERMINATED" }, staffType: { notIn: ["ACCOUNTANT", "ADMINISTRATOR"] } }, orderBy: { firstName: "asc" } }),
    db.venue.findMany({ where: { ...branchFilter, isActive: true }, orderBy: { name: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: parseDateOnly(from), lt: parseDateOnly(to) } } }),
  ]);
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = utcToLocalParts(s.startsAt).date;
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const holidayByDay = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name]));
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ ...(sp as Record<string, string>), ...o });
    return `/calendar?${p}`;
  };
  const days: string[] = [];
  for (let d = from; d < to; d = addDaysToDateString(d, 1)) days.push(d);
  const currentMonth = date.slice(0, 7);

  const chip = (s: (typeof sessions)[number], compact = false) => (
    <Link
      key={s.id}
      href={`/sessions/${s.id}`}
      className={cn("group block truncate rounded-md border-l-[3px] px-1.5 py-1 text-xs transition-colors hover:brightness-95", s.status === "CANCELLED" && "line-through opacity-50")}
      style={{ borderLeftColor: s.ageGroup?.color ?? "var(--brand)", background: `color-mix(in oklab, ${s.ageGroup?.color ?? "#13804f"} 12%, var(--surface))` }}
      title={`${s.title} · ${s.venue?.name ?? ""}`}
    >
      <span className="font-semibold tabular-nums">{formatTime(s.startsAt)}</span> {compact ? s.ageGroup?.code ?? s.title : s.title}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Training calendar"
        eyebrow="Training"
        actions={can(user, "sessions.manage") ? <><HolidayDialog allBranches={user.branchIds === null} branches={(await db.branch.findMany({ where: { isActive: true, ...(user.branchIds ? { id: { in: user.branchIds } } : {}) } })).map((b) => ({ value: b.id, label: b.name }))} /><Button asChild><Link href={`/sessions/new?date=${date}`}><Plus /> New session</Link></Button></> : null}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" asChild><Link href={qs({ date: prev })} aria-label="Previous"><ChevronLeft /></Link></Button>
            <Button variant="outline" size="icon-sm" asChild><Link href={qs({ date: next })} aria-label="Next"><ChevronRight /></Link></Button>
            <Button variant="outline" size="sm" asChild><Link href={qs({ date: today })}>Today</Link></Button>
            <h2 className="ml-2 font-display text-xl font-semibold uppercase">{title}</h2>
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-2">
            <FilterSelect param="group" label="Age group" allLabel="All groups" options={groups.map((g) => ({ value: g.id, label: g.name }))} className="sm:w-36" />
            <FilterSelect param="coach" label="Coach" allLabel="All coaches" options={coaches.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))} className="sm:w-40" />
            <FilterSelect param="venue" label="Venue" allLabel="All venues" options={venues.map((v) => ({ value: v.id, label: v.name }))} className="sm:w-36" />
            <div className="flex rounded-md border p-0.5">
              {(["month", "week", "day"] as const).map((v) => (
                <Link key={v} href={qs({ view: v })} className={cn("rounded px-3 py-1.5 text-sm font-semibold capitalize text-muted", view === v && "bg-primary text-white")}>{v}</Link>
              ))}
            </div>
          </div>
        </div>

        {view === "month" ? (
          <div>
            <div className="grid grid-cols-7 border-b bg-surface-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">{WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                return (
                  <div key={d} className={cn("min-h-20 border-b border-r p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0", d.slice(0, 7) !== currentMonth && "bg-surface-2/50 text-muted")}>
                    <Link href={qs({ view: "day", date: d })} className={cn("mb-1 inline-grid size-6 place-items-center rounded-full text-xs font-semibold hover:bg-surface-2", d === today && "bg-primary text-white hover:bg-primary")}>{Number(d.slice(8))}</Link>
                    {holidayByDay.has(d) ? <div className="mb-1 truncate rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">{holidayByDay.get(d)}</div> : null}
                    <div className="hidden flex-col gap-1 sm:flex">{list.slice(0, 4).map((s) => chip(s, true))}{list.length > 4 ? <Link href={qs({ view: "day", date: d })} className="text-[11px] font-medium text-primary">+{list.length - 4} more</Link> : null}</div>
                    <div className="flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 6).map((s) => <span key={s.id} className="size-1.5 rounded-full" style={{ background: s.ageGroup?.color ?? "var(--brand)" }} />)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={cn("grid", view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-1")}>
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className="border-b p-3 sm:min-h-96 sm:border-r sm:[&:last-child]:border-r-0">
                  <div className="mb-2 flex items-center justify-between">
                    <Link href={qs({ view: "day", date: d })} className={cn("text-sm font-semibold", d === today && "text-primary")}>{label(d, { weekday: "short", day: "numeric", month: "short" })}</Link>
                    {holidayByDay.has(d) ? <span className="rounded bg-warning-soft px-1.5 text-[10px] font-semibold text-warning">{holidayByDay.get(d)}</span> : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {list.length === 0 ? <p className="text-xs text-muted">No sessions</p> : list.map((s) => (
                      <Link key={s.id} href={`/sessions/${s.id}`} className={cn("rounded-lg border-l-4 bg-surface-2/60 p-2.5 text-sm transition-colors hover:bg-surface-2", s.status === "CANCELLED" && "opacity-50")} style={{ borderLeftColor: s.ageGroup?.color ?? "var(--brand)" }}>
                        <div className="flex items-center justify-between gap-2"><span className="font-semibold tabular-nums">{formatTime(s.startsAt)}–{formatTime(s.endsAt)}</span>{s.status !== "SCHEDULED" ? <span className="text-[10px] font-bold uppercase text-muted">{s.status}</span> : null}</div>
                        <div className={cn("font-medium", s.status === "CANCELLED" && "line-through")}>{s.title}</div>
                        <div className="text-xs text-muted">{s.venue?.name ?? "No venue"}{s.coach ? ` · ${s.coach.firstName}` : ""}{s._count.attendance ? ` · ${s._count.attendance} marked` : ""}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">{groups.map((g) => <span key={g.id} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: g.color }} />{g.name}</span>)}</div>
    </div>
  );
}
