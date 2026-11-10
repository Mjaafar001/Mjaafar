import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Pencil, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can, canAccessBranch } from "@/lib/rbac/authorize";
import { formatDate, formatTime, humanize } from "@/lib/utils";
import { PageHeader, DescriptionList, Avatar, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/action-button";
import { removeCertification } from "../actions";
import { CertificationDialog, AvailabilityEditor } from "./staff-panels";

export const metadata: Metadata = { title: "Staff profile" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("staff.view");
  const { id } = await params;
  const s = await db.staffProfile.findUnique({
    where: { id },
    include: { branch: true, user: { select: { email: true, lastLoginAt: true } }, ageGroups: { include: { ageGroup: { include: { _count: { select: { players: { where: { status: "ACTIVE", archivedAt: null } } } } } } } }, certifications: { orderBy: { expiresAt: "asc" } }, availability: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] } },
  });
  if (!s || !canAccessBranch(user, s.branchId)) notFound();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [upcoming, completedThisMonth] = await Promise.all([
    db.trainingSession.findMany({ where: { OR: [{ coachId: s.id }, { assistants: { some: { staffId: s.id } } }], startsAt: { gte: now }, status: "SCHEDULED" }, include: { venue: true, ageGroup: true }, orderBy: { startsAt: "asc" }, take: 8 }),
    db.trainingSession.count({ where: { coachId: s.id, status: "COMPLETED", startsAt: { gte: monthStart } } }),
  ]);
  const manage = can(user, "staff.manage");
  const players = s.ageGroups.reduce((n, a) => n + a.ageGroup._count.players, 0);

  return (
    <div>
      <PageHeader
        title={`${s.firstName} ${s.lastName}`}
        eyebrow={`${s.jobTitle ?? humanize(s.staffType)} · ${s.branch.name}`}
        description={<span className="flex items-center gap-2"><StatusBadge status={s.employmentStatus} /> {humanize(s.employmentType)}{s.startDate ? ` since ${formatDate(s.startDate)}` : ""}</span>}
        actions={manage ? <Button asChild><Link href={`/staff/${s.id}/edit`}><Pencil /> Edit</Link></Button> : null}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assigned players" value={players} icon={Users} hint={`${s.ageGroups.length} age groups`} />
        <StatCard label="Upcoming sessions" value={upcoming.length} icon={CalendarDays} tone="info" hint={upcoming[0] ? `Next ${formatDate(upcoming[0].startsAt, "short")}` : "None scheduled"} />
        <StatCard label="Sessions this month" value={completedThisMonth} icon={CalendarDays} tone="success" hint="Completed" />
        <StatCard label="Certifications" value={s.certifications.length} icon={Users} tone={s.certifications.some((c) => c.expiresAt && c.expiresAt < now) ? "danger" : "brand"} hint={s.certifications.some((c) => c.expiresAt && c.expiresAt < now) ? "Some expired" : "On file"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-3"><Avatar name={`${s.firstName} ${s.lastName}`} size={44} /><CardTitle>Contact</CardTitle></div></CardHeader>
          <CardContent>
            <DescriptionList items={[
              { label: "Email", value: s.email }, { label: "Phone", value: s.phone },
              { label: "Emergency contact", value: s.emergencyContactName ? `${s.emergencyContactName} · ${s.emergencyContactPhone ?? ""}` : null },
              { label: "System login", value: s.user ? `${s.user.email}${s.user.lastLoginAt ? ` · last seen ${formatDate(s.user.lastLoginAt)}` : " · never signed in"}` : "No login" },
            ]} />
            {s.qualifications ? <p className="mt-4 text-sm"><span className="text-xs font-medium uppercase tracking-wider text-muted">Qualifications</span><br />{s.qualifications}</p> : null}
            {s.bio ? <p className="mt-4 text-sm text-muted">{s.bio}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Age groups</CardTitle></CardHeader>
          <CardContent>
            {s.ageGroups.length === 0 ? <p className="text-sm text-muted">Not assigned to any age group.</p> : (
              <ul className="divide-y">{s.ageGroups.map((a) => <li key={a.ageGroupId} className="flex items-center justify-between py-2.5 text-sm"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: a.ageGroup.color }} />{a.ageGroup.name}</span><Link href={`/players?group=${a.ageGroupId}`} className="text-primary hover:underline">{a.ageGroup._count.players} players</Link></li>)}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Upcoming sessions</CardTitle></CardHeader>
          {upcoming.length === 0 ? <EmptyState icon={CalendarDays} title="Nothing scheduled" /> : (
            <ul className="divide-y">{upcoming.map((x) => (
              <li key={x.id}><Link href={`/sessions/${x.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2">
                <span><span className="font-semibold">{x.title}</span><span className="block text-muted">{x.venue?.name ?? "No venue"}</span></span>
                <span className="text-right"><span className="block font-medium">{formatDate(x.startsAt, "short")}</span><span className="text-muted">{formatTime(x.startsAt)}</span></span>
              </Link></li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Certifications</CardTitle>{manage ? <CertificationDialog staffId={s.id} /> : null}</CardHeader>
          <CardContent>
            {s.certifications.length === 0 ? <p className="text-sm text-muted">None on file.</p> : (
              <ul className="divide-y">{s.certifications.map((c) => {
                const expired = c.expiresAt && c.expiresAt < now;
                const soon = c.expiresAt && !expired && c.expiresAt.getTime() - now.getTime() < 60 * 86400000;
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <span><span className="font-medium">{c.name}</span><span className="block text-xs text-muted">{c.issuer ?? ""}{c.issuedAt ? ` · issued ${formatDate(c.issuedAt)}` : ""}</span></span>
                    <span className="flex items-center gap-2">
                      {c.expiresAt ? <Badge tone={expired ? "danger" : soon ? "warning" : "neutral"}>{expired ? "Expired" : "Expires"} {formatDate(c.expiresAt)}</Badge> : null}
                      {manage ? <ActionButton size="sm" variant="ghost" action={removeCertification.bind(null, c.id)} confirm={{ title: "Remove certification", description: c.name, destructive: true }}>Remove</ActionButton> : null}
                    </span>
                  </li>
                );
              })}</ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Work schedule</CardTitle></CardHeader>
          <CardContent>
            {manage ? <AvailabilityEditor staffId={s.id} initial={s.availability.map((a) => ({ weekday: a.weekday, startTime: a.startTime, endTime: a.endTime }))} /> : (
              s.availability.length === 0 ? <p className="text-sm text-muted">No regular schedule set.</p> : <ul className="text-sm">{s.availability.map((a) => <li key={a.id}>{DAYS[a.weekday]}: {a.startTime}–{a.endTime}</li>)}</ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
