# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), TypeScript | Turbopack. `cacheComponents` is **off**: every screen is per-user and request-time, so a static shell adds complexity without benefit. |
| UI | Tailwind CSS 4, Radix primitives in shadcn/ui style (`src/components/ui`), lucide icons, Recharts | Self-hosted Barlow / Barlow Condensed fonts. Dark mode via `.dark` class. Brand colours injected from settings. |
| Forms | React Hook Form + Zod | The **same Zod schema** validates on the client and again in the server action. |
| Data | PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`) | Client generated to `src/generated/prisma`. |
| Auth | Custom DB-backed sessions + Argon2id + TOTP MFA | See SECURITY.md. Chosen over Auth.js for full control of MFA, lockout, session revocation and auditing. |
| Files | Storage adapter: local disk or any S3-compatible bucket | Magic-byte validation; never served from a public URL. |
| Tests | Vitest (unit + DB integration), Playwright (e2e, desktop + mobile) | |

## Source layout

```
web/
  prisma/schema.prisma        full data model (all phases), migrations/, seed.ts
  src/app/(auth)/             login, MFA challenge, password setup, auth actions
  src/app/(app)/              authenticated app: dashboard, players, registrations, guardians,
                              staff, calendar, sessions, attendance, portal, settings, account
  src/app/apply/              public online application (rate-limited, honeypot)
  src/app/api/                files, photo, CSV exports, branding logo, health
  src/components/ui|forms|layout
  src/lib/
    auth/                     session, current user, password, TOTP, rate limit
    rbac/                     permission catalogue, role grants, authorize helpers
    services/                 domain logic — pure rules (*-rules.ts) + transactional services
    validators/               Zod schemas shared by client and server
    audit.ts crypto.ts storage/ notify.ts branch-context.ts dates.ts csv.ts
  tests/unit · tests/integration · tests/e2e
```

## Request flow and authorization

1. `src/app/(app)/layout.tsx` requires a signed-in user and builds the permission-filtered navigation.
2. **Every page** calls `requirePermission(...)`, which renders 403 when it's missing. **Every server action** calls `authorize(...)`, which throws. Every API route checks permissions itself. Hiding a button is never the only control.
3. Row-level scope comes from `src/lib/services/scope.ts`:
   - `playerScope(user)`: all players in the user's branches, or only a coach's assigned age groups, or only a parent's linked children.
   - `sessionScope(user)`: the equivalent for training sessions.
   - `branchWhere` / `scopedBranchWhere`: branch limits plus the top-bar branch selector.
4. Permissions are re-read from the database on each request (memoised per request), so removing a role takes effect immediately.

## Roles

Roles are rows (`Role`) with editable grants (`RolePermission`). The permission keys are defined in `src/lib/rbac/permissions.ts`. A `UserRole` can be limited to one branch (`branchId`) or apply to all of them (`null`). Users can only grant roles ranked below their own. The president (`SUPER_ADMIN`) always holds every permission.

## Data model highlights

- **Money** is stored as integer **kobo** (`*Kobo`), never floats.
- **Encrypted columns** (`*Enc`): medical fields, injury and incident descriptions, MFA secrets. They use AES-256-GCM via `src/lib/crypto.ts`.
- **Session credits**: `SessionCreditEntry` is an append-only ledger. Balance = `SUM(delta)`. Each entry has a unique `idempotencyKey`, so retries never double-post.
- **Attendance**: unique `(sessionId, playerId)` plus a `version` column for optimistic concurrency, with an `AttendanceHistory` row for every change.
- **Multi-branch**: branch-scoped tables carry `branchId`. Age groups, venues, staff, players, sessions, invoices, expenses and so on all belong to a branch.
- **Counters** (`Counter`) generate human-readable IDs atomically (`MJA-26-0042`, `APP-26-00007`).
- The schema already models every later phase: plans, subscriptions, invoices, payments, webhooks, refunds, expenses, assessments, goals, drills, training plans, matches, injuries, incidents, documents, notifications, templates, a job queue and inventory. So Phases 3–5 add features, not re-modelling.

## Attendance and credits algorithm

`recordAttendance()` in `src/lib/services/attendance.ts`, per player, inside one transaction:

1. Take `pg_advisory_xact_lock(session:player)`. This serialises concurrent saves by two coaches.
2. Load the existing row. If the caller's `expectedVersion` is stale, report a **conflict** instead of overwriting (the UI offers "reload" or "keep my marks").
3. Decide whether the new status should consume a credit (`credit-rules.ts`, using Settings → attendance policy and whether the session counts toward credits).
4. Compare with the credits already posted for this attendance row and post exactly −1, +1 or nothing.
5. If the policy disallows attendance without credit and the balance is 0, block the entry.
6. Write history. Past-day corrections require `attendance.correct` plus a reason, and are audited.

Cancelling a session (or adding a holiday) calls `reverseSessionCredits()`, which is idempotent.

## Scheduling

`schedule-rules.ts` expands weekly or fortnightly recurrences in Africa/Lagos time and skips holidays. `detectConflicts()` flags coach, venue and age-group overlaps. The server checks conflicts before saving; the user can explicitly override, and the override is audited.
