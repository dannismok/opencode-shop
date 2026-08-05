# Data & Storage Migration Pathway

How this system's SQLite setup can grow into a serverless/multi-region or
Postgres backend without a rewrite. The app treats money as **integer cents**
everywhere, so no money conversion is ever involved in a migration.

```
Stage 0          Stage 1                 Stage 2               Stage 3
local SQLite ──▶ SQLite on a            Turso / libSQL ──▶  PostgreSQL
file           volume + nightly        (serverless read    (Neon / Supabase /
(dev)          backups                 replicas)           Fly Postgres)
```

---

## Stage 0 — Local SQLite (current dev setup)

- `DATABASE_URL=file:./dev.db`, Prisma `provider = "sqlite"`.
- Nothing to do. This is the default after `npm install && npm run db:reset`.

---

## Stage 1 — SQLite on a persistent volume (deployed now)

The deployment already uses this: Fly.io volume (`/data`) or Render disk
(`/data`), `DATABASE_URL=file:/data/app.db`, uploads at `/data/uploads`.

### Backups

SQLite's `.backup` command is an **online** backup — safe while the app is
writing.

```bash
# included script, run nightly:
DB_FILE=/data/app.db ./scripts/backup-sqlite.sh s3://your-bucket/app.db
```

- Requires `sqlite3` and the `aws` CLI (or `rclone`).
- Prunes local copies older than 14 days (keep object-storage retention on your
  side, e.g. S3 lifecycle rules).
- Fly scheduled task example (add to `fly.toml` or a `fly.tasks` service):
  `15 2 * * * /app/scripts/backup-sqlite.sh s3://your-bucket/app.db`.

### Known limits (why Stage 3 is the long-term answer)

- **Single writer** — SQLite allows one writer at a time; concurrent writes
  surface as `SQLITE_BUSY` (the order service already retries its interactive
  transaction).
- **One machine only** — the database and uploads must live on one instance;
  no horizontal scaling, no multi-region.
- **Volume operations** (resize, migrate) require downtime.

---

## Stage 2 — Turso / libSQL (serverless, same dialect)

If you need serverless scale-out and multi-region *reads* while staying on the
SQLite dialect:

```bash
# 1. Install Turso CLI: https://docs.turso.tech/cli/installation
turso db create opencode-shop
turso db show opencode-shop --url        # → URL + auth token

# 2. Dump the current DB
sqlite3 /data/app.db .dump > dump.sql

# 3. Import
turso db shell opencode-shop < dump.sql
```

Code changes:

```bash
npm install @libsql/client
# prisma/schema.prisma: provider stays "sqlite"
# lib/prisma.ts: use the @libsql/client + Prisma driver adapter
#   (see https://www.prisma.io/docs/orm/overview/databases/sqlite#libsql)
# env: DATABASE_URL=libsql://opencode-shop-<org>.turso.io
```

Migration of images: move `uploads/` to object storage first (see below) —
Turso has no filesystem.

---

## Stage 3 — PostgreSQL (recommended long-term)

Neon, Supabase or Fly Postgres.

### 3.1 Code changes (near-zero)

```prisma
// backend/prisma/schema.prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Then regenerate the migration for Postgres and push the schema to the new DB:

```bash
rm -rf backend/prisma/migrations            # keep the SQLite migration for history/git
npx prisma migrate dev --name init          # regenerate for postgresql provider
```

> Keep the old `migrations/` folder committed or archived — it is your SQLite
> schema history.

### 3.2 Export the data

```bash
sqlite3 /data/app.db .dump > dump.sql
```

### 3.3 Transform with pgloader

```bash
pgloader \
  sqlite:///data/app.db \
  postgresql://user:password@host:5432/opencode_shop?sslmode=require
```

`pgloader` maps most types automatically, but verify these gotchas:

| SQLite | Postgres | Note |
| --- | --- | --- |
| `BOOLEAN` as `0/1` | `boolean` | pgloader converts automatically; verify `isActive`, `isActive`-style flags |
| `DATETIME` (RFC3339 text) | `timestamptz` | Confirm timezones are consistent (the app stores UTC) |
| `AUTOINCREMENT` / `rowid` | `BIGSERIAL`/identity | Check your `id` columns still populate (cuid in this app — no autoincrement) |
| Identifiers | case/quoting | This schema is all lowercase so quoting is a non-issue |

> SQLite stores `DATETIME` as text; Prisma round-trips `Date`s to ISO strings,
> so the stored values are already ISO-8601 UTC. Verify a sample row before
> cutting over.

### 3.4 Verify row counts

```bash
# before
sqlite3 /data/app.db "SELECT 'users',count(*) FROM User; ..."

# after
psql $DATABASE_URL -c "SELECT 'users',count(*) FROM \"User\";"
```

Check `User`, `Food`, `Order`, `OrderItem`, `Invoice`, `StockMovement` match.

### 3.5 Flip the connection

```bash
fly secrets set DATABASE_URL='postgresql://...' --config infra/fly.toml
```

`prisma migrate deploy` at boot is now a no-op for the migrated schema, so the
cutover is a deploy + env change.

### 3.6 Rollback plan

- The SQLite file and its volume are left untouched during the migration, so
  rollback = point `DATABASE_URL` back to `file:/data/app.db` and redeploy.
- Writes made to Postgres *after* the cutover will not be in the SQLite file —
  if you roll back later than the cutover, you lose that delta (acceptable for
  a single evening; not for a week).

### 3.7 Zero-downtime cutover checklist

1. **Maintenance window (simplest):**
   - Stop writes (maintenance mode flag), run pgloader, verify counts, flip
     `DATABASE_URL`, redeploy, reopen.
2. **Dual-write (no downtime):**
   - Requires code support: write to both SQLite and Postgres behind the
     `BankChargeProvider`-style abstraction, backfill with pgloader, then flip
     reads to Postgres and disable dual-write. Add this only if uptime matters.

---

## Moving `uploads/` off local disk → S3 / Cloudflare R2

`StorageProvider` in `backend/src/services/storage/` already abstracts storage:

- `LocalDiskStorageProvider` — default, writes to `UPLOAD_DIR`.
- Implement `S3StorageProvider` with the same interface (`save` / `delete` /
  `publicUrl` or presigned URLs).

```bash
# R2 example (S3-compatible)
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
# new file: backend/src/services/storage/S3StorageProvider.ts
# env: STORAGE_DRIVER=s3 S3_BUCKET=... S3_ENDPOINT=... S3_REGION=auto
```

Changes required:

1. `StorageProvider` returns an **absolute URL** (e.g. R2 public bucket URL or
   a presigned URL) instead of `/uploads/...`.
2. `serializeFood` in `routes/foods.ts` returns that URL directly; the frontend
   `resolveImageUrl()` already passes through `http(s)://` URLs unchanged.
3. Backfill: sync `backend/uploads/foods/` → bucket with `rclone`/`aws s3 sync`.
4. `express.static('/uploads', ...)` in `app.ts` can be removed when the local
   dir is empty.

Signed URLs: return short-lived presigned URLs from `S3StorageProvider.publicUrl`
for private buckets, and cache them on the `Food` row (or the client's
`React Query` cache) to avoid a presign per image render.

---

## Decision summary

- **Now:** Stage 1 (SQLite on a Fly/Render volume + nightly `sqlite3 .backup`).
- **When you need serverless / read scale:** Stage 2 (Turso).
- **Long-term:** Stage 3 (Postgres on Neon/Supabase/Fly) + R2 for uploads.
