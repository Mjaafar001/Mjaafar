"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { setActiveBranchAction } from "@/app/(app)/branch-actions";

export function BranchSwitcher({ branches, active }: { branches: { id: string; name: string }[]; active: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 rounded-md border bg-surface px-2.5 text-sm">
      <Building2 className="size-4 text-muted" />
      <span className="sr-only">Branch</span>
      <select
        className="h-9 max-w-40 bg-transparent font-medium outline-none disabled:opacity-60"
        value={active ?? ""}
        disabled={pending}
        onChange={(e) => start(async () => { await setActiveBranchAction(e.target.value || null); router.refresh(); })}
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
