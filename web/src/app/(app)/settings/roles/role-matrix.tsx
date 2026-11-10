"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveRolePermissions } from "../actions";

type Role = { id: string; key: string; name: string; description: string; users: number; editable: boolean; keys: string[] };

export function RoleMatrix({ roles, modules }: { roles: Role[]; modules: { module: string; permissions: { key: string; description: string }[] }[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState(roles[0]!.id);
  const role = roles.find((r) => r.id === selected)!;
  const [keys, setKeys] = React.useState<Set<string>>(new Set(role.keys));
  const [pending, start] = React.useTransition();
  const [seenRole, setSeenRole] = React.useState(role);
  if (seenRole !== role) {
    setSeenRole(role);
    setKeys(new Set(role.keys));
  }
  const dirty = keys.size !== role.keys.length || role.keys.some((k) => !keys.has(k));

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <ul className="p-2">
          {roles.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSelected(r.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left hover:bg-surface-2", r.id === selected && "bg-primary-soft")}>
                <span><span className="block text-sm font-semibold">{r.name}</span><span className="text-xs text-muted">{r.users} user{r.users === 1 ? "" : "s"}</span></span>
                {!r.editable ? <Lock className="size-4 text-muted" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader>
          <div><CardTitle>{role.name}</CardTitle><CardDescription>{role.description}</CardDescription></div>
          {role.editable ? (
            <Button disabled={!dirty || pending} onClick={() => start(async () => { const r = await saveRolePermissions({ roleId: role.id, permissionKeys: [...keys] }); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error); })}>Save changes</Button>
          ) : <Badge><Lock className="size-3" /> {role.key === "SUPER_ADMIN" ? "Always has every permission" : "Higher than your role"}</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {modules.map((m) => (
            <div key={m.module}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{m.module}</h4>
              <div className="grid gap-1 sm:grid-cols-2">
                {m.permissions.map((p) => (
                  <label key={p.key} className={cn("flex items-start gap-3 rounded-md p-2 text-sm", role.editable && "cursor-pointer hover:bg-surface-2")}>
                    <Checkbox className="mt-0.5" disabled={!role.editable} checked={keys.has(p.key)} onChange={(e) => { const n = new Set(keys); if (e.target.checked) n.add(p.key); else n.delete(p.key); setKeys(n); }} />
                    <span><span className="block">{p.description}</span><code className="text-[11px] text-muted">{p.key}</code></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
