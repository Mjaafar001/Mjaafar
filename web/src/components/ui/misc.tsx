import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</div> : null}
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, src, size = 36, className, color }: { name: string; src?: string | null; size?: number; className?: string; color?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-display font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, ...(color ? { background: `color-mix(in oklab, ${color} 18%, transparent)`, color } : {}) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "brand", href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: "brand" | "warning" | "danger" | "info" | "success"; href?: string }) {
  const tones = { brand: "bg-primary-soft text-primary", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger-strong", info: "bg-info-soft text-info", success: "bg-success-soft text-success" };
  const body = (
    <div className="group relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-lg border bg-surface p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className={cn("grid size-8 place-items-center rounded-md", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div>
        <div className="font-display text-3xl font-bold leading-none tabular-nums">{value}</div>
        {hint ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block h-full">
      {body}
    </a>
  ) : (
    body
  );
}

export function DescriptionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const tones = { info: "bg-info-soft text-info border-info/20", warning: "bg-warning-soft text-warning border-warning/20", danger: "bg-danger-soft text-danger-strong border-danger/20", success: "bg-success-soft text-success border-success/20" };
  return (
    <div role="status" className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
    </div>
  );
}
