"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in changes)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { params, update, pending };
}

/** Debounced search box bound to ?q= */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, update, pending } = useQueryUpdater();
  const [value, setValue] = React.useState(params.get(param) ?? "");
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update({ [param]: value.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted", pending && "animate-pulse")} />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="pl-9 pr-8" aria-label={placeholder} type="search" />
      {value ? (
        <button type="button" onClick={() => setValue("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function FilterSelect({ param, options, allLabel, className, label }: { param: string; options: { value: string; label: string }[]; allLabel: string; className?: string; label: string }) {
  const { params, update } = useQueryUpdater();
  return (
    <NativeSelect aria-label={label} value={params.get(param) ?? ""} onChange={(e) => update({ [param]: e.target.value || null })} className={cn("w-full sm:w-44", className)}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { update } = useQueryUpdater();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function SortHeader({ field, label }: { field: string; label: string }) {
  const { params, update } = useQueryUpdater();
  const current = params.get("sort");
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const active = current === field;
  return (
    <button type="button" className={cn("inline-flex items-center gap-1 uppercase", active && "text-foreground")} onClick={() => update({ sort: field, dir: active && dir === "asc" ? "desc" : "asc" })}>
      {label}
      <span aria-hidden className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>
    </button>
  );
}
