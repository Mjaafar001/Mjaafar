import type { PermissionKey } from "@/lib/rbac/permissions";

export type NavItem = { href: string; label: string; icon: string; anyOf: PermissionKey[]; mobile?: boolean };
export type NavSection = { title: string; items: NavItem[] };

/** Sidebar structure. Items are hidden unless the user holds one of `anyOf`. */
export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", anyOf: ["dashboard.view"], mobile: true },
      { href: "/portal", label: "My family", icon: "Home", anyOf: ["portal.parent", "portal.player"], mobile: true },
    ],
  },
  {
    title: "Academy",
    items: [
      { href: "/players", label: "Players", icon: "Users", anyOf: ["players.view", "players.view.assigned"], mobile: true },
      { href: "/registrations", label: "Admissions", icon: "ClipboardList", anyOf: ["registrations.view"] },
      { href: "/guardians", label: "Parents", icon: "HeartHandshake", anyOf: ["players.view"] },
      { href: "/staff", label: "Coaches & staff", icon: "IdCard", anyOf: ["staff.view"] },
    ],
  },
  {
    title: "Training",
    items: [
      { href: "/calendar", label: "Calendar", icon: "CalendarDays", anyOf: ["sessions.view"], mobile: true },
      { href: "/attendance", label: "Attendance", icon: "CheckSquare", anyOf: ["attendance.view", "attendance.record"], mobile: true },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/settings", label: "Settings", icon: "Settings", anyOf: ["settings.manage", "branches.manage", "users.manage", "roles.manage", "agegroups.manage"] },
      { href: "/settings/audit", label: "Audit log", icon: "ScrollText", anyOf: ["audit.view"] },
    ],
  },
];
