import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Pencil, Ticket, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac/authorize";
import { playerScope } from "@/lib/services/scope";
import { creditBalance } from "@/lib/services/credits";
import { ageOn, daysFromNow } from "@/lib/dates";
import { formatDate, formatDateTime, formatTime, humanize, pct } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { DescriptionList, StatCard, EmptyState } from "@/components/ui/misc";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/forms/action-button";
import { setArchived, unlinkGuardian, deleteDocument } from "../actions";
import { PhotoUpload, GuardianDialog, MedicalPanel, CreditDialog, DocumentUpload, AchievementDialog, TransferDialog } from "./profile-panels";

export const metadata: Metadata = { title: "Player profile" };

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("players.view", "players.view.assigned");
  const { id } = await params;
  const p = await db.player.findFirst({
    where: { id, ...playerScope(user) },
    include: {
      branch: true, ageGroup: true, primaryCoach: true,
      guardians: { include: { guardian: { include: { players: { include: { player: { select: { id: true, firstName: true, lastName: true } } } } } } }, orderBy: { isPrimary: "desc" } },
      emergencyContacts: true, achievements: { orderBy: { awardedOn: "desc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      transfers: { orderBy: { createdAt: "desc" }, take: 10 },
      consents: { orderBy: { signedAt: "desc" } },
      medical: { select: { clearanceStatus: true, clearanceExpiresAt: true } },
      injuries: { orderBy: { occurredAt: "desc" }, take: 10 },
    },
  });
  if (!p) notFound();

  const since30 = daysFromNow(-30);
  const [attendance, upcoming, ledger, balance, groupNames, branches] = await Promise.all([
    db.attendance.findMany({ where: { playerId: p.id }, include: { session: { include: { venue: true } } }, orderBy: { session: { startsAt: "desc" } }, take: 60 }),
    p.ageGroupId
      ? db.trainingSession.findMany({ where: { OR: [{ ageGroupId: p.ageGroupId }, { extraPlayers: { some: { playerId: p.id } } }], startsAt: { gte: new Date() }, status: { in: ["SCHEDULED", "POSTPONED"] } }, include: { venue: true, coach: true }, orderBy: { startsAt: "asc" }, take: 8 })
      : Promise.resolve([]),
    can(user, "credits.view") ? db.sessionCreditEntry.findMany({ where: { playerId: p.id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    can(user, "credits.view") ? creditBalance(p.id) : Promise.resolve(null),
    db.ageGroup.findMany({ select: { id: true, name: true } }),
    can(user, "players.transfer") ? db.branch.findMany({ where: { isActive: true, ...(user.branchIds ? { id: { in: user.branchIds } } : {}) }, include: { ageGroups: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } }) : Promise.resolve([]),
  ]);
  const recent = attendance.filter((a) => a.session.startsAt >= since30);
  const attended = (list: typeof attendance) => list.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const rate30 = pct(attended(recent), recent.length);
  const counts = attendance.reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] ?? 0) + 1), acc), {});
  const gName = new Map(groupNames.map((g) => [g.id, g.name]));
  const ledgerRows = ledger.map((e, i) => ({ ...e, balance: ledger.slice(0, i + 1).reduce((a, x) => a + x.delta, 0) })).reverse();
  const name = `${p.preferredName || p.firstName} ${p.lastName}`;
  const age = ageOn(p.dateOfBirth);

  return (
    <div>
      {/* Header */}
      <div className="relative mb-6 overflow-hidden rounded-xl border bg-surface">
        <div className="pitch-lines h-20 bg-sidebar" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-start">
          <div className="-mt-12 shrink-0"><PhotoUpload playerId={p.id} name={name} hasPhoto={!!p.photoKey} color={p.ageGroup?.color} canEdit={can(user, "players.update")} /></div>
          <div className="min-w-0 flex-1 sm:pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{name}</h1>
              <StatusBadge status={p.status} />
              {p.archivedAt ? <Badge tone="danger">Archived</Badge> : null}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span className="font-mono">{p.academyId}</span>
              <span>Age {age}</span>
              {p.ageGroup ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: p.ageGroup.color }} />{p.ageGroup.name}</span> : <span>No age group</span>}
              <span>{p.branch.name}</span>
              {p.preferredPosition ? <span>{p.preferredPosition}</span> : null}
              {p.jerseyNumber != null ? <span>#{p.jerseyNumber}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:pt-3">
            {can(user, "players.transfer") ? <TransferDialog playerId={p.id} branches={branches.map((b) => ({ id: b.id, name: b.name, groups: b.ageGroups.map((g) => ({ id: g.id, name: g.name })) }))} current={{ branchId: p.branchId, ageGroupId: p.ageGroupId ?? "" }} /> : null}
            {can(user, "players.archive") ? (
              <ActionButton variant="outline" action={setArchived.bind(null, p.id, !p.archivedAt)} confirm={{ title: p.archivedAt ? "Restore player" : "Archive player", description: p.archivedAt ? "The player returns to active lists." : "History (attendance, credits, payments) is kept. The player is hidden from active lists.", destructive: !p.archivedAt }}>
                {p.archivedAt ? "Restore" : "Archive"}
              </ActionButton>
            ) : null}
            {can(user, "players.update") ? <Button asChild><Link href={`/players/${p.id}/edit`}><Pencil /> Edit</Link></Button> : null}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {balance !== null ? <StatCard label="Sessions remaining" value={balance} icon={Ticket} tone={balance <= 0 ? "danger" : balance <= 2 ? "warning" : "success"} hint={balance <= 0 ? "Renewal due" : "Session credits"} /> : null}
        <StatCard label="Attendance (30 days)" value={rate30 == null ? "—" : `${rate30}%`} icon={CheckCircle2} tone={rate30 != null && rate30 < 60 ? "warning" : "brand"} hint={`${attended(recent)} of ${recent.length} sessions`} />
        <StatCard label="Next session" value={upcoming[0] ? formatDate(upcoming[0].startsAt, "short") : "—"} icon={CalendarDays} tone="info" hint={upcoming[0] ? `${formatTime(upcoming[0].startsAt)} · ${upcoming[0].venue?.name ?? ""}` : "Nothing scheduled"} />
        <StatCard label="Guardians" value={p.guardians.length} icon={Users} hint={p.guardians[0] ? `${p.guardians[0].guardian.firstName} (${p.guardians[0].relationship})` : "None linked"} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guardians">Guardians</TabsTrigger>
          {can(user, "medical.view") ? <TabsTrigger value="medical">Medical</TabsTrigger> : null}
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          {balance !== null ? <TabsTrigger value="credits">Session credits</TabsTrigger> : null}
          {can(user, "documents.view") ? <TabsTrigger value="documents">Documents</TabsTrigger> : null}
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Personal</CardTitle></CardHeader>
              <CardContent>
                <DescriptionList items={[
                  { label: "Full name", value: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ") },
                  { label: "Date of birth", value: `${formatDate(p.dateOfBirth)} (age ${age})` },
                  { label: "Gender", value: humanize(p.gender) },
                  { label: "Nationality", value: p.nationality },
                  { label: "Address", value: [p.address, p.city, p.state].filter(Boolean).join(", ") || null },
                  { label: "School", value: p.schoolName },
                  { label: "Registered", value: formatDate(p.registrationDate) },
                  { label: "Phone", value: p.phone },
                ]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Football</CardTitle></CardHeader>
              <CardContent>
                <DescriptionList items={[
                  { label: "Primary coach", value: p.primaryCoach ? `${p.primaryCoach.firstName} ${p.primaryCoach.lastName}` : null },
                  { label: "Position", value: [p.preferredPosition, p.secondaryPosition].filter(Boolean).join(" / ") || null },
                  { label: "Dominant foot", value: p.dominantFoot ? humanize(p.dominantFoot) : null },
                  { label: "Jersey", value: p.jerseyNumber != null || p.jerseySize ? `#${p.jerseyNumber ?? "—"} · size ${p.jerseySize ?? "—"}` : null },
                  { label: "Photo / video consent", value: `${p.photoConsent ? "Photo ✓" : "Photo ✗"} · ${p.videoConsent ? "Video ✓" : "Video ✗"}` },
                  { label: "Medical clearance", value: p.medical ? <StatusBadge status={p.medical.clearanceStatus} /> : null },
                ]} />
                {p.previousExperience ? <p className="mt-4 text-sm"><span className="text-xs font-medium uppercase tracking-wider text-muted">Experience</span><br />{p.previousExperience}</p> : null}
                {p.notes ? <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm">{p.notes}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Consent records</CardTitle></CardHeader>
              <CardContent>
                {p.consents.length === 0 ? <p className="text-sm text-muted">No digital consent on file.</p> : (
                  <ul className="divide-y text-sm">
                    {p.consents.map((c) => (
                      <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{humanize(c.type)} — {c.granted ? <span className="text-success">granted</span> : <span className="text-danger">declined</span>}</span>
                        <span className="text-xs text-muted">{c.signedName} · {formatDate(c.signedAt)} · v{c.version}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Group & branch history</CardTitle></CardHeader>
              <CardContent>
                {p.transfers.length === 0 ? <p className="text-sm text-muted">No moves recorded.</p> : (
                  <ul className="divide-y text-sm">
                    {p.transfers.map((t) => (
                      <li key={t.id} className="py-2">
                        <div>{t.fromAgeGroupId ? gName.get(t.fromAgeGroupId) : "—"} → {t.toAgeGroupId ? gName.get(t.toAgeGroupId) : "—"}{t.fromBranchId !== t.toBranchId ? " (branch change)" : ""}</div>
                        <div className="text-xs text-muted">{formatDate(t.createdAt)} · {t.reason}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="guardians">
          <div className="mb-4 flex justify-end">{can(user, "players.update") ? <GuardianDialog playerId={p.id} /> : null}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {p.guardians.map((pg) => {
              const siblings = pg.guardian.players.filter((x) => x.playerId !== p.id);
              const wa = (pg.guardian.whatsapp ?? pg.guardian.phone).replace(/^\+/, "").replace(/^0/, "234");
              return (
                <Card key={pg.guardianId}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{pg.guardian.firstName} {pg.guardian.lastName}</p>
                        <p className="text-sm text-muted">{pg.relationship}{pg.isPrimary ? " · Primary contact" : ""}{pg.receivesBilling ? " · Billing" : ""}</p>
                      </div>
                      {pg.guardian.userId ? <Badge tone="brand">Portal access</Badge> : <Badge>No portal account</Badge>}
                    </div>
                    <div className="mt-3 flex flex-col gap-1 text-sm">
                      <a href={`tel:${pg.guardian.phone}`} className="hover:text-primary">📞 {pg.guardian.phone}</a>
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">💬 WhatsApp {pg.guardian.whatsapp ?? pg.guardian.phone}</a>
                      {pg.guardian.email ? <a href={`mailto:${pg.guardian.email}`} className="hover:text-primary">✉️ {pg.guardian.email}</a> : null}
                    </div>
                    {siblings.length ? <p className="mt-3 text-xs text-muted">Also guardian of: {siblings.map((s, i) => <span key={s.playerId}>{i ? ", " : ""}<Link className="font-medium text-primary hover:underline" href={`/players/${s.playerId}`}>{s.player.firstName} {s.player.lastName}</Link></span>)}</p> : null}
                    {can(user, "players.update") && p.guardians.length > 1 ? (
                      <div className="mt-3"><ActionButton size="sm" variant="ghost" action={unlinkGuardian.bind(null, p.id, pg.guardianId)} confirm={{ title: "Remove guardian", description: "This only unlinks them from this player.", destructive: true }}>Remove from player</ActionButton></div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {p.emergencyContacts.length ? (
            <Card className="mt-4"><CardHeader><CardTitle>Other emergency contacts</CardTitle></CardHeader><CardContent><ul className="text-sm">{p.emergencyContacts.map((c) => <li key={c.id}>{c.name} ({c.relationship}) — {c.phone}</li>)}</ul></CardContent></Card>
          ) : null}
        </TabsContent>

        {can(user, "medical.view") ? (
          <TabsContent value="medical">
            <MedicalPanel playerId={p.id} canEdit={can(user, "medical.update")} clearance={p.medical?.clearanceStatus ?? "PENDING"} />
            <Card className="mt-4">
              <CardHeader><CardTitle>Injury history</CardTitle></CardHeader>
              <CardContent>{p.injuries.length === 0 ? <p className="text-sm text-muted">No injuries recorded.</p> : (
                <ul className="divide-y text-sm">{p.injuries.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.type}{i.bodyPart ? ` — ${i.bodyPart}` : ""}</span><span className="text-muted">{formatDate(i.occurredAt)} · {humanize(i.status)}</span></li>)}</ul>
              )}</CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="attendance">
          <div className="mb-4 flex flex-wrap gap-2">
            {(["PRESENT", "LATE", "ABSENT", "EXCUSED", "INJURED"] as const).map((s) => <span key={s} className="flex items-center gap-1.5 text-sm"><StatusBadge status={s} /><span className="tabular-nums text-muted">{counts[s] ?? 0}</span></span>)}
            <span className="ml-auto text-sm text-muted">Overall: <strong className="text-foreground">{pct(attended(attendance), attendance.length) ?? "—"}%</strong> of last {attendance.length}</span>
          </div>
          <Card>
            {attendance.length === 0 ? <EmptyState icon={CheckCircle2} title="No attendance yet" /> : (
              <Table>
                <THead><TR><TH>Date</TH><TH>Session</TH><TH>Venue</TH><TH>Status</TH><TH>Note</TH></TR></THead>
                <TBody>{attendance.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(a.session.startsAt)}</TD>
                    <TD><Link className="hover:text-primary" href={`/sessions/${a.sessionId}`}>{a.session.title}</Link></TD>
                    <TD className="text-muted">{a.session.venue?.name ?? "—"}</TD>
                    <TD><StatusBadge status={a.status} /></TD>
                    <TD className="text-sm text-muted">{a.note ?? ""}</TD>
                  </TR>
                ))}</TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            {upcoming.length === 0 ? <EmptyState icon={CalendarDays} title="No upcoming sessions" description="Sessions for this player's age group will appear here." /> : (
              <ul className="divide-y">{upcoming.map((s) => (
                <li key={s.id}><Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2">
                  <div><p className="font-semibold">{s.title}</p><p className="text-sm text-muted">{s.venue?.name ?? "No venue"} · {s.coach ? `${s.coach.firstName} ${s.coach.lastName}` : "No coach"}</p></div>
                  <div className="text-right text-sm"><p className="font-medium">{formatDate(s.startsAt, "long")}</p><p className="text-muted">{formatTime(s.startsAt)}–{formatTime(s.endsAt)}</p></div>
                </Link></li>
              ))}</ul>
            )}
          </Card>
        </TabsContent>

        {balance !== null ? (
          <TabsContent value="credits">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Every change to a player&apos;s sessions is recorded here and cannot be deleted. Corrections are new entries.</p>
              {can(user, "credits.adjust") ? <CreditDialog playerId={p.id} /> : null}
            </div>
            <Card>
              {ledgerRows.length === 0 ? <EmptyState icon={Ticket} title="No session credits yet" description="Credits are added when a package is paid (Phase 3) or by an administrator." /> : (
                <Table>
                  <THead><TR><TH>Date</TH><TH>Type</TH><TH>Reason</TH><TH className="text-right">Change</TH><TH className="text-right">Balance</TH></TR></THead>
                  <TBody>{ledgerRows.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt)}</TD>
                      <TD><Badge tone={e.delta > 0 ? "success" : "neutral"}>{humanize(e.type)}</Badge></TD>
                      <TD className="text-sm text-muted">{e.reason}</TD>
                      <TD className={`text-right font-semibold tabular-nums ${e.delta > 0 ? "text-success" : "text-danger"}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</TD>
                      <TD className="text-right tabular-nums">{e.balance}</TD>
                    </TR>
                  ))}</TBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        ) : null}

        {can(user, "documents.view") ? (
          <TabsContent value="documents">
            {can(user, "documents.manage") ? <DocumentUpload playerId={p.id} /> : null}
            <Card className="mt-4">
              {p.documents.length === 0 ? <EmptyState icon={Ticket} title="No documents" description="Birth certificates, consent forms and medical clearances are stored privately." /> : (
                <Table>
                  <THead><TR><TH>Document</TH><TH>Type</TH><TH>Uploaded</TH><TH>Expires</TH><TH /></TR></THead>
                  <TBody>{p.documents.map((d) => {
                    const restricted = d.isSensitive && !can(user, "medical.view");
                    const expired = d.expiresAt && d.expiresAt < new Date();
                    return (
                      <TR key={d.id}>
                        <TD>{restricted ? <span className="text-muted">{d.title} (restricted)</span> : <a className="font-medium hover:text-primary" href={`/api/files/${d.id}`} target="_blank" rel="noopener">{d.title}</a>}</TD>
                        <TD><Badge>{humanize(d.type)}</Badge>{d.isSensitive ? <Badge tone="warning" className="ml-1">Sensitive</Badge> : null}</TD>
                        <TD className="text-sm text-muted">{formatDate(d.createdAt)}</TD>
                        <TD className="text-sm">{d.expiresAt ? <span className={expired ? "font-semibold text-danger" : ""}>{formatDate(d.expiresAt)}</span> : "—"}</TD>
                        <TD className="text-right">{can(user, "documents.manage") ? <ActionButton size="sm" variant="ghost" action={deleteDocument.bind(null, d.id)} confirm={{ title: "Remove document", description: "The file is hidden and kept for the audit trail.", destructive: true }}>Remove</ActionButton> : null}</TD>
                      </TR>
                    );
                  })}</TBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="achievements">
          <div className="mb-4 flex justify-end">{can(user, "players.update", "development.assess") ? <AchievementDialog playerId={p.id} /> : null}</div>
          {p.achievements.length === 0 ? <Card><EmptyState icon={CheckCircle2} title="No achievements yet" /></Card> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.achievements.map((a) => (
                <Card key={a.id} className="border-l-4 border-l-[var(--accent-brand)]"><CardContent className="pt-5"><p className="font-display text-lg font-semibold uppercase">🏆 {a.title}</p><p className="text-xs text-muted">{formatDate(a.awardedOn)}</p>{a.description ? <p className="mt-2 text-sm">{a.description}</p> : null}</CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
