import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted",
      brand: "bg-primary-soft text-primary",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger-strong",
      info: "bg-info-soft text-info",
      outline: "border text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "success", PENDING: "warning", TRIAL: "info", SUSPENDED: "danger", INACTIVE: "neutral", GRADUATED: "brand", TRANSFERRED: "neutral",
  SUBMITTED: "warning", UNDER_REVIEW: "info", TRIAL_SCHEDULED: "info", WAITLISTED: "neutral", APPROVED: "success", REJECTED: "danger", WITHDRAWN: "neutral",
  SCHEDULED: "info", COMPLETED: "success", CANCELLED: "danger", POSTPONED: "warning",
  PRESENT: "success", LATE: "warning", ABSENT: "danger", EXCUSED: "info", INJURED: "danger",
  CLEARED: "success", NOT_CLEARED: "danger", EXPIRED: "danger",
  ON_LEAVE: "warning", PROBATION: "info", TERMINATED: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} className={className}>
      {status.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
