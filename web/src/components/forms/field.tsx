"use client";
import * as React from "react";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Label + control + error/hint wrapper used by every form. The label is linked to the first
 * control automatically (id/htmlFor), and errors are exposed via aria-invalid/aria-describedby.
 */
export function Field({ label, htmlFor, error, hint, required, className, children }: { label: string; htmlFor?: string; error?: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  const auto = React.useId();
  const msgId = `${auto}-msg`;
  const list = React.Children.toArray(children);
  const idx = list.findIndex((c) => React.isValidElement(c) && isControl(c));
  const control = idx >= 0 ? (list[idx] as React.ReactElement<Record<string, unknown>>) : null;
  const controlId = (control?.props.id as string | undefined) ?? htmlFor ?? (control ? auto : undefined);
  const kids = control
    ? list.map((c, i) => (i === idx ? React.cloneElement(control, { id: controlId, "aria-invalid": error ? true : undefined, "aria-describedby": error || hint ? msgId : undefined }) : c))
    : list;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      {kids}
      {error ? <p id={msgId} className="text-xs font-medium text-danger">{error}</p> : hint ? <p id={msgId} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const CONTROL_NAMES = new Set(["Input", "NativeSelect", "Textarea"]);
function isControl(el: React.ReactElement): boolean {
  const t = el.type as { displayName?: string } | string;
  return typeof t === "string" ? ["input", "select", "textarea"].includes(t) : CONTROL_NAMES.has(t.displayName ?? "");
}

export function FormSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-4 border-b pb-6 last:border-0 last:pb-0 lg:grid-cols-[220px_1fr] lg:gap-8", className)}>
      <div>
        <h3 className="font-display text-base font-semibold uppercase tracking-wide">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Pulls a nested error message out of a react-hook-form errors object, e.g. err(errors, "guardian.phone"). */
export function err(errors: unknown, path: string): string | undefined {
  let cur: unknown = errors;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur && typeof cur === "object" && "message" in cur ? String((cur as { message: unknown }).message) : undefined;
}

/** Applies server-side field errors (from ActionResult) to a react-hook-form instance. */
export function applyServerErrors(fieldErrors: Record<string, string[]> | undefined, setError: (name: never, e: { message: string }) => void) {
  if (!fieldErrors) return;
  for (const [k, v] of Object.entries(fieldErrors)) setError(k as never, { message: v[0] ?? "Invalid" });
}
