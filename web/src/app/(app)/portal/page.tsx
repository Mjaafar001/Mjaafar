import type { Metadata } from "next";
import { CalendarDays, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { playerScope } from "@/lib/services/scope";
import { creditBalances } from "@/lib/services/credits";
import { ageOn, daysFromNow } from "@/lib/dates";
import { formatDate, formatTime, pct } from "@/lib/utils";
import { PageHeader, EmptyState, Avatar } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My family" };

/** Parent / player portal. Data is limited by playerScope to linked children only. */
export default async function PortalPage() {
  const user = await requirePermission("portal.parent", "portal.player");
  const children = await db.player.findMany({
    where: { ...playerScope(user), archivedAt: null },
    include: { ageGroup: true, branch: true, primaryCoach: { select: { firstName: true, lastName: true } } },
    orderBy: { dateOfBirth: "asc" },
  });
  const balances = await creditBalances(children.map((c) => c.id));
  const since = daysFromNow(-30);
  const data = await Promise.all(children.map(async (c) => {
    const [upcoming, recent] = await Promise.all([
      c.ageGroupId ? db.trainingSession.findMany({ where: { OR: [{ ageGroupId: c.ageGroupId }, { extraPlayers: { some: { playerId: c.id } } }], startsAt: { gte: new Date() } }, include: { venue: true }, orderBy: { startsAt: "asc" }, take: 4 }) : Promise.resolve([]),
      db.attendance.findMany({ where: { playerId: c.id, session: { startsAt: { gte: since }, status: { not: "CANCELLED" } } }, include: { session: true }, orderBy: { session: { startsAt: "desc" } } }),
    ]);
    return { c, upcoming, recent };
  }));
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" }, select: { contactPhone: true, contactEmail: true, paymentInstructions: true } });

  return (
    <div className="max-w-4xl">
      <PageHeader title="My family" eyebrow="Parent portal" description="Training schedules, attendance and remaining sessions for your children." />
      {children.length === 0 ? <Card><EmptyState icon={Users} title="No linked children" description="If this is unexpected, contact the academy so they can link your account." /></Card> : (
        <div className="flex flex-col gap-6">
          {data.map(({ c, upcoming, recent }) => {
            const credits = balances.get(c.id) ?? 0;
            const attended = recent.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
            return (
              <Card key={c.id} className="overflow-hidden">
                <div className="h-1.5" style={{ background: c.ageGroup?.color ?? "var(--brand)" }} />
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Avatar name={`${c.firstName} ${c.lastName}`} src={c.photoKey ? `/api/players/${c.id}/photo` : null} size={56} color={c.ageGroup?.color} />
                    <div>
                      <CardTitle className="text-2xl">{c.preferredName || c.firstName} {c.lastName}</CardTitle>
                      <p className="text-sm text-muted">{c.ageGroup?.name ?? "Age group pending"} · Age {ageOn(c.dateOfBirth)} · {c.branch.name} · <span className="font-mono">{c.academyId}</span></p>
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className={`rounded-lg p-4 ${credits <= 0 ? "bg-danger-soft" : credits <= 2 ? "bg-warning-soft" : "bg-success-soft"}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sessions remaining</p>
                    <p className="font-display text-4xl font-bold">{credits}</p>
                    {credits <= 0 ? <p className="text-xs font-medium text-danger-strong">Renewal due — please contact the academy</p> : null}
                  </div>
                  <div className="rounded-lg bg-surface-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Attendance (30 days)</p>
                    <p className="font-display text-4xl font-bold">{pct(attended, recent.length) ?? "—"}{recent.length ? "%" : ""}</p>
                    <p className="text-xs text-muted">{attended} of {recent.length} sessions</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Coach</p>
                    <p className="mt-1 font-semibold">{c.primaryCoach ? `${c.primaryCoach.firstName} ${c.primaryCoach.lastName}` : "—"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" /> Upcoming training</h4>
                    {upcoming.length === 0 ? <p className="text-sm text-muted">No sessions scheduled.</p> : (
                      <ul className="divide-y rounded-lg border">{upcoming.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span><span className="font-medium">{formatDate(s.startsAt, "long")}</span><span className="block text-xs text-muted">{s.venue?.name ?? ""}</span></span>
                          {s.status === "CANCELLED" ? <Badge tone="danger">Cancelled</Badge> : <span className="font-semibold tabular-nums">{formatTime(s.startsAt)}</span>}
                        </li>
                      ))}</ul>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Recent attendance</h4>
                    <ul className="flex flex-col gap-1.5">{recent.slice(0, 6).map((a) => <li key={a.id} className="flex items-center justify-between text-sm"><span className="text-muted">{formatDate(a.session.startsAt, "short")}</span><StatusBadge status={a.status} /></li>)}</ul>
                    {recent.length === 0 ? <p className="text-sm text-muted">No sessions yet.</p> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card><CardContent className="pt-5 text-sm"><p className="font-semibold">Contact the academy</p><p className="text-muted">{[settings.contactPhone, settings.contactEmail].filter(Boolean).join(" · ")}</p>{settings.paymentInstructions ? <p className="mt-3 whitespace-pre-line rounded-md bg-surface-2 p-3">{settings.paymentInstructions}</p> : null}<p className="mt-3 text-xs text-muted">Online payments, invoices and messaging arrive in upcoming updates.</p></CardContent></Card>
        </div>
      )}
    </div>
  );
}
