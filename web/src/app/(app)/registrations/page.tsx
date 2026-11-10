import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/authorize";
import { scopedBranchWhere } from "@/lib/branch-context";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { SearchInput, FilterSelect, Pagination } from "@/components/forms/list-controls";
import { ageOn } from "@/lib/dates";
import { formatDate, humanize } from "@/lib/utils";
import type { Prisma, RegistrationStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admissions" };
const PAGE = 25;
const STATUSES: RegistrationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "TRIAL_SCHEDULED", "WAITLISTED", "APPROVED", "REJECTED", "WITHDRAWN"];
const OPEN: RegistrationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "TRIAL_SCHEDULED", "WAITLISTED"];

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requirePermission("registrations.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as RegistrationStatus) ? (sp.status as RegistrationStatus) : null;
  const branchFilter = await scopedBranchWhere(user);
  const where: Prisma.RegistrationWhereInput = {
    ...branchFilter,
    status: status ?? { in: OPEN },
    ...(sp.q ? { OR: [{ childFirstName: { contains: sp.q, mode: "insensitive" } }, { childLastName: { contains: sp.q, mode: "insensitive" } }, { reference: { contains: sp.q, mode: "insensitive" } }, { guardianPhone: { contains: sp.q } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.registration.findMany({ where, orderBy: status === "WAITLISTED" ? { waitlistedAt: "asc" } : { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { requestedAgeGroup: true, branch: { select: { code: true } } } }),
    db.registration.count({ where }),
    db.registration.groupBy({ by: ["status"], where: branchFilter, _count: true }),
  ]);
  const count = (s: RegistrationStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Admissions"
        eyebrow="Academy"
        description="Online applications, trials and the waiting list."
        actions={<Button variant="outline" asChild><a href="/apply" target="_blank" rel="noopener"><ExternalLink /> Open public form</a></Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["SUBMITTED", "UNDER_REVIEW", "TRIAL_SCHEDULED", "WAITLISTED"] as const).map((s) => (
          <Link key={s} href={`/registrations?status=${s}`} className={`rounded-lg border bg-surface p-4 transition-shadow hover:shadow-md ${status === s ? "ring-2 ring-primary" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">{humanize(s)}</div>
            <div className="font-display text-3xl font-bold">{count(s)}</div>
          </Link>
        ))}
      </div>
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <SearchInput placeholder="Child, reference or phone" />
          <FilterSelect param="status" label="Status" allLabel="All open" options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        </div>
        {rows.length === 0 ? <EmptyState icon={ClipboardList} title="No applications" description="New online applications appear here." /> : (
          <Table>
            <THead><TR><TH>Reference</TH><TH>Child</TH><TH>Age</TH><TH>Requested group</TH><TH className="hidden md:table-cell">Parent</TH><TH>Type</TH><TH>Submitted</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.map((r, i) => (
                <TR key={r.id}>
                  <TD><Link href={`/registrations/${r.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{r.reference}</Link>{r.status === "WAITLISTED" ? <span className="ml-2 text-xs text-muted">#{(page - 1) * PAGE + i + 1}</span> : null}</TD>
                  <TD className="font-semibold"><Link href={`/registrations/${r.id}`} className="hover:text-primary">{r.childFirstName} {r.childLastName}</Link></TD>
                  <TD className="tabular-nums">{ageOn(r.childDateOfBirth)}</TD>
                  <TD>{r.requestedAgeGroup ? `${r.requestedAgeGroup.name} · ${r.branch.code}` : <span className="text-muted">Not specified</span>}</TD>
                  <TD className="hidden text-sm md:table-cell">{r.guardianFirstName} {r.guardianLastName}<div className="text-xs text-muted">{r.guardianPhone}</div></TD>
                  <TD><Badge tone={r.type === "TRIAL" ? "info" : "outline"}>{r.type === "TRIAL" ? "Trial" : "Full"}</Badge></TD>
                  <TD className="text-sm text-muted">{formatDate(r.createdAt)}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} />
      </Card>
    </div>
  );
}
