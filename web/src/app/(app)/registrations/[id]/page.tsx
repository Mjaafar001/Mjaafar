import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, can, canAccessBranch } from "@/lib/rbac/authorize";
import { ageOn } from "@/lib/dates";
import { formatDate, formatDateTime, humanize } from "@/lib/utils";
import { PageHeader, DescriptionList, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApplicationInput } from "@/lib/validators/registration";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Application" };

export default async function RegistrationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("registrations.view");
  const { id } = await params;
  const r = await db.registration.findUnique({ where: { id }, include: { branch: true, requestedAgeGroup: true, assignedAgeGroup: true, consents: true, documents: { where: { deletedAt: null } } } });
  if (!r || !canAccessBranch(user, r.branchId)) notFound();
  const app = r.payload as unknown as Omit<ApplicationInput, "medical">;
  const groups = await db.ageGroup.findMany({ where: { branchId: r.branchId, isActive: true }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { players: { where: { status: { in: ["ACTIVE", "TRIAL", "PENDING"] }, archivedAt: null } } } } } });
  // Possible duplicates / siblings by guardian phone.
  const related = await db.guardian.findMany({ where: { phone: r.guardianPhone }, include: { players: { include: { player: { select: { id: true, firstName: true, lastName: true, academyId: true } } } } } });
  const age = ageOn(r.childDateOfBirth);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`${r.childFirstName} ${r.childLastName}`}
        eyebrow={<span className="font-mono">{r.reference}</span>}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><Badge tone={r.type === "TRIAL" ? "info" : "outline"}>{r.type === "TRIAL" ? "Trial request" : "Full registration"}</Badge> Submitted {formatDateTime(r.createdAt)} · {r.branch.name}</span>}
        actions={r.playerId ? <Button asChild><Link href={`/players/${r.playerId}`}>Open player profile</Link></Button> : null}
      />
      {related.some((g) => g.players.length) ? (
        <Alert tone="info" title="This parent already has children at the academy" className="mb-6">
          {related.flatMap((g) => g.players).map((pg, i) => <span key={pg.playerId}>{i ? ", " : ""}<Link className="font-semibold underline" href={`/players/${pg.playerId}`}>{pg.player.firstName} {pg.player.lastName} ({pg.player.academyId})</Link></span>)}. Approving links this child to the same guardian account.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Child</CardTitle></CardHeader>
            <CardContent>
              <DescriptionList items={[
                { label: "Full name", value: [app.child.firstName, app.child.middleName, app.child.lastName].filter(Boolean).join(" ") },
                { label: "Date of birth", value: `${formatDate(r.childDateOfBirth)} (age ${age})` },
                { label: "Gender", value: humanize(r.childGender) },
                { label: "Nationality", value: app.child.nationality },
                { label: "Address", value: [app.child.address, app.child.city, app.child.state].filter(Boolean).join(", ") || null },
                { label: "School", value: app.child.schoolName },
                { label: "Position", value: app.child.preferredPosition },
                { label: "Stronger foot", value: app.child.dominantFoot ? humanize(app.child.dominantFoot) : null },
                { label: "Requested group", value: r.requestedAgeGroup?.name },
                { label: "Jersey size", value: app.child.jerseySize },
              ]} />
              {app.child.previousExperience ? <p className="mt-4 text-sm"><span className="text-xs font-medium uppercase tracking-wider text-muted">Experience</span><br />{app.child.previousExperience}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Parents & contacts</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {app.guardians.map((g, i) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <p className="font-semibold">{g.firstName} {g.lastName} <span className="font-normal text-muted">· {g.relationship}</span></p>
                  <p className="text-muted">{g.phone}{g.whatsapp ? ` · WhatsApp ${g.whatsapp}` : ""}{g.email ? ` · ${g.email}` : ""}</p>
                </div>
              ))}
              {app.emergencyContacts?.filter((c) => c.name).map((c, i) => <p key={i} className="text-sm">Emergency: {c.name} ({c.relationship}) — {c.phone}</p>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Consent</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {r.consents.map((c) => <li key={c.id} className="flex justify-between py-2"><span>{humanize(c.type)}</span><span className={c.granted ? "text-success" : "text-muted"}>{c.granted ? "Granted" : "Not given"}</span></li>)}
              </ul>
              <p className="mt-3 text-xs text-muted">Signed &quot;{r.consents[0]?.signedName}&quot; · {r.consents[0] ? formatDateTime(r.consents[0].signedAt) : ""} · version {r.consents[0]?.version}</p>
              {r.documents.length ? <div className="mt-3 text-sm">{r.documents.map((d) => <a key={d.id} href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="block font-medium text-primary hover:underline">📎 {d.title}</a>)}</div> : null}
              <p className="mt-3 text-xs text-muted">Medical answers are encrypted and transferred to the player&apos;s medical record on approval.</p>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {can(user, "registrations.review") && !["APPROVED", "REJECTED", "WITHDRAWN"].includes(r.status) ? (
            <ReviewPanel
              registrationId={r.id}
              type={r.type}
              defaultGroupId={r.assignedAgeGroupId ?? r.requestedAgeGroupId ?? ""}
              groups={groups.map((g) => ({ id: g.id, name: g.name, occupancy: g._count.players, capacity: g.capacity }))}
            />
          ) : null}
          {r.decisionNotes || r.reviewedAt ? (
            <Card><CardContent className="pt-5 text-sm"><p className="text-xs font-medium uppercase tracking-wider text-muted">Review notes</p><p className="mt-1">{r.decisionNotes ?? "—"}</p>{r.reviewedAt ? <p className="mt-2 text-xs text-muted">Last reviewed {formatDateTime(r.reviewedAt)}</p> : null}{r.trialDate ? <p className="mt-2">Trial: <strong>{formatDateTime(r.trialDate)}</strong></p> : null}</CardContent></Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
