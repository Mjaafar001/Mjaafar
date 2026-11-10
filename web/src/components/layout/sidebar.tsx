"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, ClipboardList, HeartHandshake, IdCard, CalendarDays, CheckSquare, Settings, ScrollText, Home, Menu, X, type LucideIcon,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";
import { AcademyMark } from "./logo";
import type { NavSection } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, Users, ClipboardList, HeartHandshake, IdCard, CalendarDays, CheckSquare, Settings, ScrollText, Home };

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings" || (pathname.startsWith("/settings/") && !pathname.startsWith("/settings/audit"));
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">{s.title}</div>
          <ul className="flex flex-col gap-0.5">
            {s.items.map((it) => {
              const Icon = ICONS[it.icon] ?? LayoutDashboard;
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/5 hover:text-white",
                      active && "bg-sidebar-active text-white shadow-[inset_3px_0_0_var(--accent-brand)]",
                    )}
                  >
                    <Icon className={cn("size-[18px] text-sidebar-muted group-hover:text-white", active && "text-accent")} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <AcademyMark logoUrl={logoUrl} />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold uppercase tracking-wide text-white">{name}</div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-sidebar-muted">Academy OS</div>
      </div>
    </Link>
  );
}

export function Sidebar({ sections, name, logoUrl }: { sections: NavSection[]; name: string; logoUrl: string | null }) {
  return (
    <aside className="pitch-lines fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 overflow-y-auto bg-sidebar px-3 py-5 lg:flex">
      <Brand name={name} logoUrl={logoUrl} />
      <NavLinks sections={sections} />
    </aside>
  );
}

export function MobileNav({ sections, name, logoUrl }: { sections: NavSection[]; name: string; logoUrl: string | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="grid size-10 place-items-center rounded-md hover:bg-surface-2 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 lg:hidden" />
        <D.Content className="pitch-lines fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-8 overflow-y-auto bg-sidebar px-3 py-5 lg:hidden">
          <D.Title className="sr-only">Menu</D.Title>
          <D.Description className="sr-only">Main navigation</D.Description>
          <div className="flex items-center justify-between">
            <Brand name={name} logoUrl={logoUrl} />
            <D.Close className="rounded-md p-2 text-sidebar-foreground hover:bg-white/10" aria-label="Close menu">
              <X className="size-5" />
            </D.Close>
          </div>
          <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Bottom tab bar on phones for the most-used sections. */
export function BottomNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const items = sections.flatMap((s) => s.items).filter((i) => i.mobile).slice(0, 5);
  if (items.length < 2) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} aria-label="Quick">
      {items.map((it) => {
        const Icon = ICONS[it.icon] ?? LayoutDashboard;
        const active = isActive(pathname, it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted", active && "text-primary")}>
            <Icon className="size-5" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
