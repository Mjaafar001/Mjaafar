import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission, branchWhere, can } from "@/lib/rbac/authorize";
import { accessibleBranches, activeBranchId } from "@/lib/branch-context";
import { PageHeader } from "@/components/ui/misc";
import { addDaysToDateString, utcToLocalParts } from "@/lib/dates";
import { SessionForm } from "../session-form";

export const metadata: Metadata = { title: "New session" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePermission("sessions.manage");
  const sp = await searchParams;
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });
  const coachOnly = !can(user, "players.view") && user.staffId;
  const [branches, groups, venues, coaches] = await Promise.all([
    accessibleBranches(user),
    db.ageGroup.findMany({ where: { ...branchWhere(user), isActive: true, ...(coachOnly ? { staff: { some: { staffId: user.staffId! } } } : {}) }, orderBy: { sortOrder: "asc" } }),
    db.venue.findMany({ where: { ...branchWhere(user), isActive: true }, orderBy: { name: "asc" } }),
    db.staffProfile.findMany({ where: { ...branchWhere(user), employmentStatus: { in: ["ACTIVE", "PROBATION"] }, staffType: { notIn: ["ACCOUNTANT", "ADMINISTRATOR", "OTHER"] } }, orderBy: { firstName: "asc" } }),
  ]);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : utcToLocalParts(new Date()).date;
  return (
    <div className="max-w-5xl">
      <PageHeader title="New training session" eyebrow="Calendar" description="Coach, venue and age-group double bookings are detected automatically." />
      <SessionForm
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name, branchId: g.branchId }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name, branchId: v.branchId }))}
        coaches={coaches.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, branchId: c.branchId }))}
        defaults={{ branchId: (await activeBranchId(user)) ?? branches[0]?.id ?? "", title: "", ageGroupId: "", venueId: "", coachId: coachOnly ? user.staffId! : "", date, startTime: "16:00", durationMinutes: settings.defaultSessionMinutes, capacity: "", objectives: "", notes: "", countsTowardCredits: true, repeat: false, weekdays: [], intervalWeeks: 1, repeatUntil: addDaysToDateString(date, 84), allowConflicts: false }}
      />
    </div>
  );
}
