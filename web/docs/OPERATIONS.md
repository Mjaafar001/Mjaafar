# Operations

## Backups
- **Database**: enable your managed provider's daily backups and point-in-time recovery. In addition, run `npm run db:backup` (a `pg_dump` custom-format file in `backups/`, keeping the latest 30) from a scheduled job, and copy the files off-site.
- **Files**: back up or replicate the storage bucket, or `STORAGE_LOCAL_DIR`.
- **Keys**: store `DATA_ENCRYPTION_KEY` in a password manager or secrets vault, separately from database backups. A backup can't be decrypted without it, and a stolen backup is useless without it.

## Restore
```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/mj-academy-YYYYMMDDTHHMMSSZ.dump
npm run db:deploy        # applies any migrations newer than the backup
```
Test a restore into a scratch database every quarter.

## Migrations
- Development: `npm run db:migrate` creates and applies a migration. Commit the files in `prisma/migrations`.
- Production: `npm run db:deploy` applies pending migrations only. It never resets data.

## Key rotation
`DATA_ENCRYPTION_KEY` rotation needs a re-encryption script: decrypt with the old key and encrypt with the new one, inside a maintenance window. It is planned as a Phase 6 utility. `SESSION_SECRET` can be rotated at any time; users simply sign in again.

## Health and monitoring
- `GET /api/health` returns 200 when the app and database respond.
- Review **Settings → Audit log** for failed logins, medical-record views and exports.
