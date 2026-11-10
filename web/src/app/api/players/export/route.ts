import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/rbac/authorize";
import { audit } from "@/lib/audit";
import { ageOn } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { playerListQuery } from "@/app/(app)/players/query";

/** CSV export of the filtered player list. Medical data is never included. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mfaPending || user.mfaSetupRequired) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "players.export")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { where, orderBy } = await playerListQuery(user, sp);
  const players = await db.player.findMany({ where, orderBy, include: { ageGroup: true, branch: true, guardians: { include: { guardian: true } } } });
  const rows = players.map((p) => {
    const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0];
    return {
      "Academy ID": p.academyId, "First name": p.firstName, "Last name": p.lastName, "Date of birth": p.dateOfBirth.toISOString().slice(0, 10), Age: ageOn(p.dateOfBirth),
      Gender: p.gender, Branch: p.branch.name, "Age group": p.ageGroup?.name ?? "", Status: p.status, Position: p.preferredPosition ?? "", "Jersey no.": p.jerseyNumber ?? "",
      "Jersey size": p.jerseySize ?? "", "Registered": p.registrationDate.toISOString().slice(0, 10), Guardian: g ? `${g.guardian.firstName} ${g.guardian.lastName}` : "",
      "Guardian phone": g?.guardian.phone ?? "", "Guardian email": g?.guardian.email ?? "", "Photo consent": p.photoConsent ? "Yes" : "No",
    };
  });
  await audit({ actorId: user.id, action: "player.export", entityType: "Player", summary: `Exported ${rows.length} players` });
  return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="players-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
