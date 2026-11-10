# Progress checklist

Legend: ✅ done and tested · 🟡 partial · ⬜ not started

## Phase 1 — Foundation ✅
- ✅ Next.js 16 + TypeScript + Tailwind 4 project; shadcn-style component library; dark/light mode; responsive shell (sidebar, mobile drawer, bottom tab bar); PWA manifest + service worker (no data caching)
- ✅ Full PostgreSQL schema for all phases, initial migration, seed (base + demo)
- ✅ Authentication: Argon2id, DB sessions, idle timeout, lockout, rate limiting, TOTP MFA enrolment/challenge, password setup/reset links, change password, session list
- ✅ RBAC: 7 roles, 37 permissions, editable permission matrix, branch-limited roles, rank-protected role granting
- ✅ Academy settings: identity, logo upload, colours (applied live), contact, cutoff date, fee defaults, attendance/credit policy, MFA policy, retention
- ✅ Branches, venues, seasons, users; audit log viewer
- ✅ Branch switcher (consolidated or per-branch views for multi-branch users)

## Phase 2 — Core operations ✅
- ✅ Players: list (search, filters, sort, pagination, bulk status/age group), CSV export, registration form with age-group suggestion, profile (overview, guardians, medical, attendance, schedule, credit ledger, documents, achievements), edit, move between groups and branches (with history), archive and restore, private photos
- ✅ Guardians: multiple per player, one guardian for many children (auto-matched by phone or email), parent directory
- ✅ Medical: encrypted, revealed on demand with an audit entry, clearance status and expiry
- ✅ Documents: private upload (magic-byte validation), expiry dates, sensitive-document restrictions, soft delete
- ✅ Admissions: public multi-step application (full or trial), digital consents, optional birth certificate, rate limit and honeypot; review queue; approve (academy ID, guardian de-duplication, parent account and invite link, encrypted medical transfer), approve as trial, wait-list, schedule trial, decline; capacity enforcement
- ✅ Age groups: create, rename, capacity, colours, deactivate, merge (moves players, staff and future sessions; history kept)
- ✅ Staff: directory, profiles, assigned age groups, certifications with expiry warnings, work schedule, optional login creation
- ✅ Calendar: month/week/day views, filters, recurring sessions, holidays (skip and auto-cancel), conflict detection with audited override, reschedule, cancel (this or following, credits returned), makeup/trial/guest players
- ✅ Attendance: mobile-first register (P/L/A/E/I, notes, mark-all), credit deduction per policy, duplicate prevention, concurrent-edit conflict handling, past-day corrections with a reason, reports with CSV export
- ✅ Dashboards: admin/president (live stats, today's schedule, charts, renewals, pending applications) and coach-scoped variant; basic parent portal (children, credits, schedule, attendance)

## Testing ✅
- ✅ 39 unit/integration tests (Vitest, real Postgres): rules, crypto, passwords, TOTP, CSV, validation, credit deduction and reversal, simultaneous coaches, stale-version conflicts, cancelled sessions, no-credit policy, ledger idempotency, approvals, siblings, capacity, concurrent academy IDs, coach/parent/branch isolation, role removal, branch moves, rate limiting
- ✅ 8 Playwright e2e tests (desktop + Pixel 7): auth, role access, private file protection, player registration, medical reveal, full apply→approve flow, mobile attendance (including a no-horizontal-scroll check)
- ✅ `tsc`, ESLint and `next build` clean

## Phase 3 — Payments ⬜ (next)
Subscription plans (monthly calendar vs session package), invoices, manual payments (cash, transfer, POS), Paystack (test mode) with signed, idempotent webhooks, receipts, partial payments, sibling discounts and scholarships, refunds, credit allocation on payment, renewal and overdue reminders, overdue-attendance policy, revenue on the dashboard.

## Phase 4 — Portals & communication ⬜
Full parent portal (invoices, pay, receipts, absence and makeup requests, contact details), coach tasks, announcements, message templates, email + official WhatsApp adapters, job queue with retries and de-duplication, in-app notifications, QR check-in, training plan builder and drill library.

## Phase 5 — Advanced ⬜
Assessments (templates, scoring, progress graphs, PDF reports), development goals, matches and tournaments, injuries and safeguarding incidents with escalation, inventory, expenses and full financial reporting, payroll.

## Phase 6 — Production readiness 🟡
- ✅ Security headers, health endpoint, backup script, deployment and operations docs
- ⬜ Retention purge job, guardian data-export tool, encryption-key rotation script, error monitoring integration (e.g. Sentry), load testing, CI pipeline, importer for the legacy v1 app's backup JSON
