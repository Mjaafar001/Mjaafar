import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/rbac/authorize";
import { NAV } from "@/lib/nav";
import { getBranding } from "@/lib/branding";
import { accessibleBranches, activeBranchId } from "@/lib/branch-context";
import { Sidebar, MobileNav, BottomNav } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BranchSwitcher } from "@/components/layout/branch-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce their own permissions; MFA-setup is allowed here so the security page can render.
  const user = await requireUser({ allowMfaSetup: true });
  const branding = await getBranding();
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => can(user, ...i.anyOf)) })).filter((s) => s.items.length > 0);
  const branches = user.permissions.has("portal.parent") && user.roles.length === 1 ? [] : await accessibleBranches(user);
  const active = await activeBranchId(user);
  const logoUrl = branding.hasLogo ? `/api/branding/logo?v=${branding.logoVersion}` : null;
  const topRole = [...user.roles].sort((a, b) => b.rank - a.rank)[0];

  return (
    <div className="min-h-dvh">
      <Sidebar sections={sections} name={branding.shortName} logoUrl={logoUrl} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <MobileNav sections={sections} name={branding.shortName} logoUrl={logoUrl} />
          <div className="flex-1" />
          {branches.length > 1 ? <BranchSwitcher branches={branches} active={active} /> : null}
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} roleLabel={topRole?.name ?? ""} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>
      <BottomNav sections={sections} />
    </div>
  );
}
