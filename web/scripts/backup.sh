#!/usr/bin/env bash
# Logical backup of the academy database (custom format, compressed).
# Restore with:  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/<file>.dump
# Schedule daily (e.g. cron 0 2 * * *) and copy the files off-server. Uploaded files (storage/ or the
# S3 bucket) must be backed up separately, and DATA_ENCRYPTION_KEY kept safe — encrypted fields need it.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${DATABASE_URL:?DATABASE_URL is not set}"
mkdir -p backups
file="backups/mj-academy-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner "${DATABASE_URL%%\?*}" -f "$file"
echo "Backup written to $file"
# Keep the 30 most recent backups.
ls -1t backups/*.dump | tail -n +31 | xargs -r rm --
