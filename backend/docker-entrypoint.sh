#!/bin/sh
set -e

# Ensure the uploads directory exists (it lives on the /data volume).
mkdir -p "${UPLOAD_DIR:-/data/uploads}"

# Apply pending Prisma migrations before the app starts. Idempotent.
npx prisma migrate deploy

exec "$@"
