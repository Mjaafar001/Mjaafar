"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";
import { reviewRegistration } from "../actions";

type Decision = "APPROVE" | "APPROVE_TRIAL" | "WAITLIST" | "REJECT" | "UNDER_REVIEW" | "SCHEDULE_TRIAL";

export function ReviewPanel({ registrationId, type, defaultGroupId, groups }: { registrationId: string; type: string; defaultGroupId: string; groups: { id: string; name: string; occupancy: number; capacity: number | null }[] }) {
  const router = useRouter();
  const [groupId, setGroupId] = React.useState(defaultGroupId);
  const [notes, setNotes] = React.useState("");
  const [trialDate, setTrialDate] = React.useState("");
  const [invite, setInvite] = React.useState<{ link: string; playerId: string } | null>(null);
  const [pending, start] = React.useTransition();
  const group = groups.find((g) => g.id === groupId);
  const full = !!group && group.capacity != null && group.occupancy >= group.capacity;

  const decide = (decision: Decision) =>
    start(async () => {
      const r = await reviewRegistration({ registrationId, decision, ageGroupId: groupId, notes, trialDate });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      const data = r.data as { playerId?: string; inviteLink?: string | null } | undefined;
      if (data?.inviteLink && data.playerId) setInvite({ link: data.inviteLink, playerId: data.playerId });
      else if (data?.playerId) router.push(`/players/${data.playerId}`);
      else router.refresh();
    });

  if (invite) {
    return (
      <Alert tone="success" title="Player created">
        <p className="mb-2">A parent portal account was created. If email isn&apos;t configured yet, send this one-time link to the parent privately (e.g. WhatsApp):</p>
        <div className="flex gap-2"><Input readOnly value={invite.link} className="text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(invite.link); toast.success("Copied"); }}><Copy /></Button></div>
        <Button className="mt-3" onClick={() => router.push(`/players/${invite.playerId}`)}>Open player profile</Button>
      </Alert>
    );
  }

  return (
    <Card className="sticky top-20">
      <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label="Age group">
          <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Choose…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.occupancy}{g.capacity ? `/${g.capacity}` : ""}{g.capacity != null && g.occupancy >= g.capacity ? " (full)" : ""}</option>)}
          </NativeSelect>
        </Field>
        {full ? <Alert tone="warning">{group!.name} is full. Wait-list the child or increase capacity in Settings.</Alert> : null}
        <Field label="Notes (internal)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={pending || !groupId || full} onClick={() => decide("APPROVE")} className="col-span-2">Approve & create player</Button>
          {type === "TRIAL" ? <Button variant="secondary" disabled={pending || !groupId || full} onClick={() => decide("APPROVE_TRIAL")} className="col-span-2">Approve as trial player</Button> : null}
          <Button variant="outline" disabled={pending} onClick={() => decide("WAITLIST")}>Wait-list</Button>
          <Button variant="outline" disabled={pending} onClick={() => decide("UNDER_REVIEW")}>Mark in review</Button>
        </div>
        <div className="flex flex-col gap-2 border-t pt-4">
          <Field label="Trial date & time"><Input type="datetime-local" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} /></Field>
          <Button variant="outline" disabled={pending || !trialDate} onClick={() => decide("SCHEDULE_TRIAL")}>Schedule trial</Button>
        </div>
        <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => decide("REJECT")}>Decline application</Button>
      </CardContent>
    </Card>
  );
}
