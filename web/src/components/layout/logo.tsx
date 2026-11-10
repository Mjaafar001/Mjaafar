import { cn } from "@/lib/utils";

export function AcademyMark({ className, logoUrl }: { className?: string; logoUrl?: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={cn("size-9 rounded-lg object-contain", className)} />;
  }
  return (
    <svg viewBox="0 0 32 32" className={cn("size-9", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <rect x="5" y="7" width="22" height="18" fill="none" stroke="white" strokeWidth="1.8" rx="1" />
      <path d="M16 7v18" stroke="white" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="3.6" fill="none" stroke="white" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="1" fill="var(--accent-brand)" />
    </svg>
  );
}
