import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { MfaPanel, PasswordPanel } from "./security-panels";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const user = await requireUser({ allowMfaSetup: true });
  const { setup } = await searchParams;
  const sessions = await db.session.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, take: 10 });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Security" description="Manage your password, two-factor authentication and active sessions." />
      {setup === "required" && user.mfaSetupRequired ? (
        <Alert tone="warning" title="Two-factor authentication required" className="mb-6">
          Your role has access to sensitive player and financial data. Set up an authenticator app to continue.
        </Alert>
      ) : null}
      <div className="flex flex-col gap-6">
        <MfaPanel enabled={user.mfaEnabled} required={user.isPrivileged} />
        <PasswordPanel />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>Changing your password signs out all other devices.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="max-w-md truncate text-muted">{s.userAgent ?? "Unknown device"}</span>
                  <span className="text-xs text-muted">
                    {s.id === user.sessionId ? <strong className="text-success">This device · </strong> : null}
                    last active {formatDateTime(s.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
