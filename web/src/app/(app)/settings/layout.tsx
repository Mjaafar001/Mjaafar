import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/rbac/authorize";
import { PageHeader } from "@/components/ui/misc";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    { href: "/settings", label: "Academy", show: can(user, "settings.manage") },
    { href: "/settings/age-groups", label: "Age groups", show: can(user, "agegroups.manage") },
    { href: "/settings/branches", label: "Branches", show: can(user, "branches.manage") },
    { href: "/settings/venues", label: "Venues & seasons", show: can(user, "settings.manage") },
    { href: "/settings/users", label: "Users", show: can(user, "users.manage") },
    { href: "/settings/roles", label: "Roles & permissions", show: can(user, "roles.manage") },
    { href: "/settings/audit", label: "Audit log", show: can(user, "audit.view") },
  ].filter((l) => l.show);
  return (
    <div>
      <PageHeader title="Settings" eyebrow="Administration" description="Configure the academy without code changes." />
      <SettingsNav links={links} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
