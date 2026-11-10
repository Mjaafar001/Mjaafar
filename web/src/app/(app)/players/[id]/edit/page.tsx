import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { playerScope } from "@/lib/services/scope";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/ui/misc";
import { PlayerForm } from "../../player-form";
import { playerFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "Edit player" };

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("players.update");
  const { id } = await params;
  const p = await db.player.findFirst({ where: { id, ...playerScope(user) } });
  if (!p) notFound();
  const options = await playerFormOptions(user);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${p.firstName} ${p.lastName}`} eyebrow={p.academyId} />
      <PlayerForm
        mode="edit"
        options={options}
        defaults={{
          id: p.id, branchId: p.branchId, firstName: p.firstName, lastName: p.lastName, middleName: p.middleName ?? "", preferredName: p.preferredName ?? "", dateOfBirth: toDateInput(p.dateOfBirth),
          gender: p.gender, nationality: p.nationality, address: p.address ?? "", city: p.city ?? "", state: p.state ?? "", phone: p.phone ?? "", status: p.status, ageGroupId: p.ageGroupId ?? "",
          primaryCoachId: p.primaryCoachId ?? "", preferredPosition: p.preferredPosition ?? "", secondaryPosition: p.secondaryPosition ?? "", dominantFoot: p.dominantFoot ?? "",
          previousExperience: p.previousExperience ?? "", jerseyNumber: p.jerseyNumber ?? "", jerseySize: p.jerseySize ?? "", schoolName: p.schoolName ?? "",
          registrationDate: toDateInput(p.registrationDate), notes: p.notes ?? "", photoConsent: p.photoConsent, videoConsent: p.videoConsent,
        }}
      />
    </div>
  );
}
