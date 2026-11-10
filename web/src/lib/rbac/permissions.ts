/**
 * Permission catalogue. Keys are checked server-side on every page, server action and API route.
 * Role → permission grants are stored in the database (RolePermission) and editable in
 * Settings → Roles & permissions; DEFAULT_ROLE_GRANTS is only the initial seed.
 */
export const PERMISSIONS = {
  "dashboard.view": { module: "Dashboard", description: "View the academy dashboard" },

  "players.view": { module: "Players", description: "View all players in permitted branches" },
  "players.view.assigned": { module: "Players", description: "View only players in assigned age groups" },
  "players.create": { module: "Players", description: "Register players directly" },
  "players.update": { module: "Players", description: "Edit player profiles, guardians and status" },
  "players.archive": { module: "Players", description: "Archive players" },
  "players.export": { module: "Players", description: "Export player data" },
  "players.transfer": { module: "Players", description: "Move players between age groups and branches" },

  "medical.view": { module: "Medical", description: "View medical information" },
  "medical.update": { module: "Medical", description: "Edit medical information" },

  "registrations.view": { module: "Admissions", description: "View applications" },
  "registrations.review": { module: "Admissions", description: "Approve, reject or wait-list applications" },

  "agegroups.manage": { module: "Age groups", description: "Create, edit, merge and deactivate age groups" },

  "staff.view": { module: "Staff", description: "View the staff directory" },
  "staff.manage": { module: "Staff", description: "Create and edit staff profiles" },

  "sessions.view": { module: "Training", description: "View the training calendar" },
  "sessions.manage": { module: "Training", description: "Create, reschedule and cancel sessions" },

  "attendance.view": { module: "Attendance", description: "View attendance records" },
  "attendance.record": { module: "Attendance", description: "Take attendance" },
  "attendance.correct": { module: "Attendance", description: "Correct attendance after the session day" },

  "credits.view": { module: "Billing", description: "View session credit balances" },
  "credits.adjust": { module: "Billing", description: "Grant or adjust session credits" },
  "billing.view": { module: "Billing", description: "View invoices and payments" },
  "billing.manage": { module: "Billing", description: "Manage plans, invoices and payments" },

  "finance.view": { module: "Finance", description: "View financial reports" },

  "development.view": { module: "Development", description: "View assessments and goals" },
  "development.assess": { module: "Development", description: "Create assessments and goals" },

  "communication.send": { module: "Communication", description: "Send announcements and messages" },

  "documents.view": { module: "Documents", description: "View and download documents" },
  "documents.manage": { module: "Documents", description: "Upload and remove documents" },

  "settings.manage": { module: "Settings", description: "Edit academy settings, venues and seasons" },
  "branches.manage": { module: "Settings", description: "Create and edit branches" },
  "users.manage": { module: "Settings", description: "Create users and assign roles" },
  "roles.manage": { module: "Settings", description: "Edit role permissions" },
  "audit.view": { module: "Settings", description: "View audit logs" },

  "portal.parent": { module: "Portals", description: "Parent portal: linked children only" },
  "portal.player": { module: "Portals", description: "Player portal: own record only" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = ["SUPER_ADMIN", "ADMIN", "HEAD_COACH", "COACH", "ACCOUNTANT", "PARENT", "PLAYER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_DEFS: Record<RoleKey, { name: string; description: string; rank: number; privileged: boolean }> = {
  SUPER_ADMIN: { name: "Academy President", description: "Full access to every branch and setting", rank: 100, privileged: true },
  ADMIN: { name: "Academy Administrator", description: "Daily operations, registrations, schedules and attendance", rank: 80, privileged: true },
  HEAD_COACH: { name: "Head Coach", description: "Coaching staff, development, training programmes", rank: 60, privileged: false },
  ACCOUNTANT: { name: "Accountant", description: "Invoices, payments, expenses and financial reports", rank: 50, privileged: true },
  COACH: { name: "Coach", description: "Assigned players, attendance, sessions and evaluations", rank: 40, privileged: false },
  PARENT: { name: "Parent / Guardian", description: "Linked children only", rank: 10, privileged: false },
  PLAYER: { name: "Player", description: "Own schedule and development", rank: 5, privileged: false },
};

const except = (...keys: PermissionKey[]) => ALL_PERMISSIONS.filter((k) => !keys.includes(k) && !k.startsWith("portal."));

export const DEFAULT_ROLE_GRANTS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: except("players.view.assigned"),
  ADMIN: except("players.view.assigned", "roles.manage", "branches.manage", "finance.view"),
  HEAD_COACH: [
    "dashboard.view", "players.view", "players.update", "players.transfer", "medical.view",
    "registrations.view", "agegroups.manage", "staff.view", "sessions.view", "sessions.manage",
    "attendance.view", "attendance.record", "attendance.correct", "credits.view",
    "development.view", "development.assess", "communication.send", "documents.view",
  ],
  COACH: [
    "dashboard.view", "players.view.assigned", "medical.view", "staff.view", "sessions.view", "sessions.manage",
    "attendance.view", "attendance.record", "credits.view", "development.view", "development.assess",
  ],
  ACCOUNTANT: [
    "dashboard.view", "players.view", "players.export", "credits.view", "credits.adjust", "billing.view",
    "billing.manage", "finance.view", "documents.view", "staff.view",
  ],
  PARENT: ["portal.parent"],
  PLAYER: ["portal.player"],
};
