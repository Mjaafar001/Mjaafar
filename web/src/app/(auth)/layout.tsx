import { getBranding } from "@/lib/branding";
import { AcademyMark } from "@/components/layout/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  const logoUrl = b.hasLogo ? `/api/branding/logo?v=${b.logoVersion}` : null;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="pitch-lines relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-[var(--brand)] opacity-30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-[var(--accent-brand)] opacity-10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <AcademyMark logoUrl={logoUrl} className="size-11" />
          <span className="font-display text-2xl font-bold uppercase tracking-wide">{b.name}</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-wide">
            Develop players.<br />
            <span className="text-[var(--accent-brand)]">Run the academy.</span>
          </p>
          <p className="mt-4 text-sidebar-foreground/80">Registrations, training, attendance, development and family communication in one secure place.</p>
        </div>
        <p className="relative text-xs text-sidebar-muted">Protected system. Access is logged. Player data is handled in line with the Nigeria Data Protection Act 2023.</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <AcademyMark logoUrl={logoUrl} />
            <span className="font-display text-xl font-bold uppercase tracking-wide">{b.name}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
