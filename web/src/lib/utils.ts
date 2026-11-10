import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIMEZONE = "Africa/Lagos";

/** Formats integer kobo as Naira. */
export function formatNaira(kobo: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const value = (kobo ?? 0) / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(value);
}

export function nairaToKobo(naira: number) {
  return Math.round(naira * 100);
}

export function formatDate(d: Date | string | null | undefined, style: "short" | "medium" | "long" = "medium") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const opts: Intl.DateTimeFormatOptions =
    style === "short" ? { day: "numeric", month: "short" } : style === "long" ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: TIMEZONE }).format(date);
}

export function formatTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function fullName(p: { firstName: string; lastName: string; preferredName?: string | null }) {
  return `${p.preferredName || p.firstName} ${p.lastName}`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}

export function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function pct(n: number, d: number) {
  return d === 0 ? null : Math.round((n / d) * 100);
}
