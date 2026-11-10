import type { Metadata } from "next";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { activeBranchId } from "@/lib/branch-context";
import { PageHeader } from "@/components/ui/misc";
import { StaffForm } from "../staff-form";
import { staffFormData } from "../form-data";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const user = await requirePermission("staff.manage");
  const { branches, groups } = await staffFormData(user);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Add staff member" eyebrow="Staff" />
      <StaffForm branches={branches} groups={groups} hasLogin={false} canCreateLogin={can(user, "users.manage")}
        defaults={{ branchId: (await activeBranchId(user)) ?? branches[0]?.id ?? "", firstName: "", lastName: "", email: "", phone: "", staffType: "COACH", jobTitle: "", employmentStatus: "ACTIVE", employmentType: "FULL_TIME", startDate: new Date().toISOString().slice(0, 10), qualifications: "", bio: "", emergencyContactName: "", emergencyContactPhone: "", ageGroupIds: [], createLogin: false }} />
    </div>
  );
}
