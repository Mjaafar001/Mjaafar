import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, can, canAccessBranch } from "@/lib/rbac/authorize";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/ui/misc";
import { StaffForm } from "../../staff-form";
import { staffFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit staff" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("staff.manage");
  const { id } = await params;
  const s = await db.staffProfile.findUnique({ where: { id }, include: { ageGroups: true } });
  if (!s || !canAccessBranch(user, s.branchId)) notFound();
  const { branches, groups } = await staffFormData(user);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${s.firstName} ${s.lastName}`} eyebrow="Staff" />
      <StaffForm branches={branches} groups={groups} hasLogin={!!s.userId} canCreateLogin={can(user, "users.manage")}
        defaults={{ id: s.id, branchId: s.branchId, firstName: s.firstName, lastName: s.lastName, email: s.email ?? "", phone: s.phone ?? "", staffType: s.staffType, jobTitle: s.jobTitle ?? "", employmentStatus: s.employmentStatus, employmentType: s.employmentType, startDate: toDateInput(s.startDate), qualifications: s.qualifications ?? "", bio: s.bio ?? "", emergencyContactName: s.emergencyContactName ?? "", emergencyContactPhone: s.emergencyContactPhone ?? "", ageGroupIds: s.ageGroups.map((a) => a.ageGroupId), createLogin: false }} />
    </div>
  );
}
