# MJ Football Academy — Academy OS

The management platform for MJ Football Academy. It covers players and families, admissions, coaches and staff, the training calendar, attendance with session credits, role-based access across branches, and an audit trail. It is built with Next.js 16, TypeScript, Tailwind CSS 4, PostgreSQL and Prisma 7.

> The original lightweight app (plain HTML/JS, browser storage) still lives at the repository root. This `web/` app replaces it and is built in phases. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Quick start (local development)

Requirements: Node.js 22+, PostgreSQL 14+.

```bash
cd web
cp .env.example .env              # then fill in DATABASE_URL and the two keys
openssl rand -base64 32           # run twice: DATA_ENCRYPTION_KEY and SESSION_SECRET
npm install
npm run db:migrate                # applies migrations
npm run db:seed                   # base data + fictional demo academy
npm run dev                       # http://localhost:3000
```

Demo logins (password `Academy2026!`). These exist only in the demo seed and are refused in production:

| Email | Role |
|---|---|
| president@mjfootball.example | Academy President (all branches) |
| admin@mjfootball.example | Administrator (Lekki branch) |
| headcoach@mjfootball.example | Head Coach (Lekki) |
| coach@mjfootball.example | Coach (U8/U10 only) |
| abuja.coach@mjfootball.example | Coach (Abuja branch) |
| accounts@mjfootball.example | Accountant |
| parent@mjfootball.example | Parent of two siblings |

The public application form is at `/apply`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run typecheck` · `npm run lint` | Static checks |
| `npm test` | Unit + integration tests (needs `TEST_DATABASE_URL`, a database whose name contains `test`) |
| `npm run test:e2e` | Playwright end-to-end tests against a running server with demo data |
| `npm run db:migrate` · `db:deploy` | Create/apply migrations (dev) · apply only (production) |
| `npm run db:seed` · `db:seed:base` | Demo data · production bootstrap (roles, settings, first president) |
| `npm run db:backup` | `pg_dump` backup into `backups/` (keeps 30) |

## Production deployment

1. **Database**: a managed PostgreSQL with automated daily backups and point-in-time recovery (e.g. DigitalOcean Managed PostgreSQL, Neon or AWS RDS). Use TLS (`?sslmode=require`).
2. **Secrets**: set `DATABASE_URL`, `APP_URL` (https), `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, and storage variables in your host's secret store. Keep an offline copy of `DATA_ENCRYPTION_KEY`; encrypted medical data can't be recovered without it.
3. **Storage**: set `STORAGE_DRIVER=s3` with a **private** bucket (S3, Cloudflare R2 or DigitalOcean Spaces). Files are only served through permission-checked routes.
4. **Build and migrate**:
   ```bash
   npm ci
   npm run db:deploy
   SEED_ADMIN_EMAIL=you@domain SEED_ADMIN_PASSWORD='…' npm run db:seed:base
   npm run build
   npm start
   ```
   Node 22 hosts (DigitalOcean App Platform, Render, Railway, Fly.io, a VM behind Nginx) all work. Serve over HTTPS only; the app sends HSTS and a strict CSP.
5. **After first login**: the president is required to enrol in two-factor authentication. Then configure Settings → Academy, branches, venues and age groups.
6. **Monitoring**: point an uptime check at `GET /api/health` (it checks the database). Send logs to your platform's log drain.
7. **Backups**: managed-database backups, plus `npm run db:backup` copied off-site, plus a storage bucket replication or backup. Restore steps are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, data model, key decisions
- [docs/SECURITY.md](docs/SECURITY.md): security controls and NDPA 2023 considerations
- [docs/OPERATIONS.md](docs/OPERATIONS.md): backups, restore, key rotation, retention
- [docs/PROGRESS.md](docs/PROGRESS.md): phase checklist, what is done and what is next
