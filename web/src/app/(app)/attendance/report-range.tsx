"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ReportRange({ from, to, presets }: { from: string; to: string; presets: { month: [string, string]; last30: [string, string] } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (f: string, t: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">From<Input type="date" value={from} onChange={(e) => e.target.value && go(e.target.value, to)} className="w-40" /></label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">To<Input type="date" value={to} onChange={(e) => e.target.value && go(from, e.target.value)} className="w-40" /></label>
      <Button variant="ghost" size="sm" onClick={() => go(...presets.month)}>This month</Button>
      <Button variant="ghost" size="sm" onClick={() => go(...presets.last30)}>Last 30 days</Button>
    </div>
  );
}
