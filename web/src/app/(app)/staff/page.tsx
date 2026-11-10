import type { Metadata } from "next";
import Link from "next/link";
import { IdCard, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { scopedBranchWhere } from "@/lib/branch-context";
import { PageHeader, EmptyState, Avatar } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { SearchInput, FilterSelect } from "@/components/forms/list-controls";
import { STAFF_TYPES } from "@/lib/validators/operations";
import { humanize } from "@/lib/utils";
import type { Prisma, StaffType } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Coaches & staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string }> }) {
  const user = await requirePermission("staff.view");
  const sp = await searchParams;
  const where: Prisma.StaffProfileWhereInput = {
    ...(await scopedBranchWhere(user)),
    ...(sp.type && (STAFF_TYPES as readonly string[]).includes(sp.type) ? { staffType: sp.type as StaffType } : {}),
    employmentStatus: sp.status === "former" ? "TERMINATED" : { not: "TERMINATED" },
    ...(sp.q ? { OR: [{ firstName: { contains: sp.q, mode: "insensitive" } }, { lastName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const now = new Date();
  const staff = await db.staffProfile.findMany({
    where, orderBy: [{ staffType: "asc" }, { firstName: "asc" }],
    include: { branch: { select: { code: true } }, ageGroups: { include: { ageGroup: true } }, certifications: true, _count: { select: { sessionsLed: { where: { startsAt: { gte: now }, status: "SCHEDULED" } } } } },
  });
  return (
    <div>
      <PageHeader title="Coaches & staff" eyebrow="Academy" description={`${staff.length} people`} actions={can(user, "staff.manage") ? <Button asChild><Link href="/staff/new"><UserPlus /> Add staff</Link></Button> : null} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput placeholder="Search staff" />
        <FilterSelect param="type" label="Role" allLabel="All roles" options={STAFF_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
        <FilterSelect param="status" label="Employment" allLabel="Current staff" options={[{ value: "former", label: "Former staff" }]} />
      </div>
      {staff.length === 0 ? <Card><EmptyState icon={IdCard} title="No staff found" /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => {
            const expiring = s.certifications.filter((c) => c.expiresAt && c.expiresAt.getTime() - now.getTime() < 60 * 86400000).length;
            return (
              <Link key={s.id} href={`/staff/${s.id}`} className="group rounded-xl border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start gap-4">
                  <Avatar name={`${s.firstName} ${s.lastName}`} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-xl font-semibold uppercase group-hover:text-primary">{s.firstName} {s.lastName}</p>
                    <p className="text-sm text-muted">{s.jobTitle ?? humanize(s.staffType)} · {s.branch.code}</p>
                  </div>
                  <StatusBadge status={s.employmentStatus} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.ageGroups.map((ag) => <span key={ag.ageGroupId} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium"><span className="size-1.5 rounded-full" style={{ background: ag.ageGroup.color }} />{ag.ageGroup.name}</span>)}
                  {s.ageGroups.length === 0 ? <span className="text-xs text-muted">No age groups assigned</span> : null}
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted">
                  <span>{s._count.sessionsLed} upcoming sessions</span>
                  {expiring ? <Badge tone="warning">{expiring} cert. expiring</Badge> : s.userId ? <Badge tone="brand">Has login</Badge> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
