import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { AcademyMark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Apply" };

export default async function ApplyPage() {
  const b = await getBranding();
  const branches = await db.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ageGroups: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, minAge: true, maxAgeExclusive: true, isActive: true, sortOrder: true } } },
  });
  const settings = await db.academySettings.findUniqueOrThrow({ where: { id: "default" }, select: { ageCutoffMonth: true, ageCutoffDay: true } });
  return (
    <div className="min-h-dvh">
      <header className="pitch-lines bg-sidebar text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3"><AcademyMark logoUrl={b.hasLogo ? `/api/branding/logo?v=${b.logoVersion}` : null} /><span className="font-display text-xl font-bold uppercase tracking-wide">{b.name}</span></div>
          <ThemeToggle className="text-white hover:bg-white/10" />
        </div>
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-4">
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">Player application</h1>
          <p className="mt-2 max-w-xl text-sidebar-foreground/80">Apply for a full place or book a trial session. It takes about 5 minutes. We&apos;ll contact you after reviewing your application.</p>
        </div>
      </header>
      <main className="mx-auto -mt-6 max-w-3xl px-4 pb-16">
        <ApplicationForm branches={branches} cutoff={{ month: settings.ageCutoffMonth, day: settings.ageCutoffDay }} />
        <p className="mt-6 text-center text-xs text-muted">Your information is used only to manage your child&apos;s place at the academy, in line with the Nigeria Data Protection Act 2023. Medical details are encrypted and visible only to authorised staff.</p>
      </main>
    </div>
  );
}
