import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac/authorize";
import { activeBranchId } from "@/lib/branch-context";
import { PageHeader } from "@/components/ui/misc";
import { PlayerForm } from "../player-form";
import { playerFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Register player" };

export default async function NewPlayerPage() {
  const user = await requirePermission("players.create");
  const options = await playerFormOptions(user);
  const branchId = (await activeBranchId(user)) ?? options.branches[0]?.id ?? "";
  return (
    <div className="max-w-5xl">
      <PageHeader title="Register player" eyebrow="Players" description="Direct registration by staff. Families can also apply online at /apply." />
      <PlayerForm
        mode="create"
        options={options}
        defaults={{
          branchId, firstName: "", lastName: "", middleName: "", preferredName: "", dateOfBirth: "", gender: "MALE", nationality: "Nigerian", address: "", city: "Lagos", state: "Lagos", phone: "",
          status: "ACTIVE", ageGroupId: "", primaryCoachId: "", preferredPosition: "", secondaryPosition: "", dominantFoot: "", previousExperience: "", jerseyNumber: "", jerseySize: "", schoolName: "",
          registrationDate: new Date().toISOString().slice(0, 10), notes: "", photoConsent: false, videoConsent: false, openingCredits: "",
          guardian: { firstName: "", lastName: "", relationship: "Mother", phone: "", whatsapp: "", email: "", address: "", occupation: "" },
        }}
      />
    </div>
  );
}
