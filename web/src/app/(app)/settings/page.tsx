import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { getBranding } from "@/lib/branding";
import { AcademySettingsForm } from "./academy-form";

export const metadata: Metadata = { title: "Academy settings" };

export default async function AcademySettingsPage() {
  await requirePermission("settings.manage");
  const s = await db.academySettings.findUniqueOrThrow({ where: { id: "default" } });
  const b = await getBranding();
  return (
    <AcademySettingsForm
      logoUrl={b.hasLogo ? `/api/branding/logo?v=${b.logoVersion}` : null}
      defaults={{
        name: s.name, shortName: s.shortName, primaryColor: s.primaryColor, accentColor: s.accentColor,
        contactEmail: s.contactEmail ?? "", contactPhone: s.contactPhone ?? "", address: s.address ?? "", website: s.website ?? "",
        timezone: s.timezone, currency: "NGN", academyIdPrefix: s.academyIdPrefix, defaultSessionMinutes: s.defaultSessionMinutes,
        defaultMonthlyFeeNaira: s.defaultMonthlyFeeKobo / 100, defaultSessionsPerPackage: s.defaultSessionsPerPackage, registrationFeeNaira: s.registrationFeeKobo / 100,
        creditDeductStatuses: s.creditDeductStatuses, allowAttendanceWithoutCredit: s.allowAttendanceWithoutCredit, paymentInstructions: s.paymentInstructions ?? "",
        ageCutoffMonth: s.ageCutoffMonth, ageCutoffDay: s.ageCutoffDay, mfaRequiredForPrivileged: s.mfaRequiredForPrivileged, dataRetentionMonths: s.dataRetentionMonths,
      }}
    />
  );
}
