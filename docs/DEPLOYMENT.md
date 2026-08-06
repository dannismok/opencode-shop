# Deployment Guide

Primary target: **backend on Fly.io** (SQLite needs a real disk, so we use a
persistent volume) and **frontend on Vercel**. Render is the one-click
alternative for the backend.

All commands assume you are in the repo root.

---

## 1. Backend on Fly.io

### Prereqs

- A [Fly.io](https://fly.io) account.
- The Fly CLI installed: `flyctl` (`curl -L https://fly.io/install.sh | sh` or
  `winget install flyctl` on Windows).

### Steps

```bash
# 1. Launch the app shell (no deploy yet)
fly launch --no-deploy

# 2. Create the persistent volume for SQLite + uploads (1 GB)
fly volumes create data -s 1 --region sin

# 3. Set secrets (never commit these)
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly secrets set CORS_ORIGIN=https://opencode-shop.vercel.app

# 4. Deploy
fly deploy
```

`fly.toml` (repo root) already wires the internal port (4000), the `data`
volume mounted at `/data`, the health check on `/api/v1/health`, and
`DATABASE_URL=file:/data/app.db` / `UPLOAD_DIR=/data/uploads`.

### First boot

The `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the
server, so the schema is created automatically. To load demo data run:

```bash
fly ssh console
node seed/prisma/seed.js
```

### OTP / SMS in production

`OTP_MODE` defaults to `console` (codes are logged and returned in the response
only when `NODE_ENV !== 'production'`). On Fly `NODE_ENV=production`, so plug in
Twilio:

```bash
fly secrets set OTP_MODE=twilio TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=+1...
```

### Logs, scale, and updates

```bash
fly logs
fly scale count 1        # SQLite = single writer, keep it at 1
fly deploy               # redeploy after git pull
```

### CORS / custom domain / HTTPS

- `CORS_ORIGIN` accepts a comma-separated list, e.g.
  `https://opencode-shop.vercel.app,https://shop.mybrand.com`.
- Fly gives you `https://opencode-shop-api.fly.dev` with HTTPS automatically.
- To attach a custom domain:

```bash
fly certs add shop-api.mybrand.com
# then add the DNS `CNAME` shown by the previous command at your DNS provider
```

---

## 2. Frontend on Vercel

### Steps

```bash
# 1. Create the Vercel project pointing at the `frontend/` directory
#    (or run: npx vercel link from the repo root — set "Root Directory" = frontend)

# 2. Point the SPA at the deployed backend and build
npx vercel env add VITE_API_BASE_URL production
#    value: https://opencode-shop-api.fly.dev

# 3. Deploy
npx vercel --prod
```

`frontend/vercel.json` contains an SPA rewrite so deep links like
`/orders/abc` fall back to `/index.html`.

### Setting VITE_API_BASE_URL without CLI

Vercel dashboard → project → Settings → Environment Variables →
`VITE_API_BASE_URL = https://opencode-shop-api.fly.dev` (Production), then
redeploy. Do **not** commit a real `.env.production` — a template lives at
`frontend/.env.production.example`.

### CORS must match

Whatever origin Vercel serves the app from (`https://your-app.vercel.app`) must
be in the backend's `CORS_ORIGIN`. Example:

```bash
fly secrets set CORS_ORIGIN=https://your-app.vercel.app
```

### Custom domain (frontend)

Vercel dashboard → project → Settings → Domains → add your domain and follow
the DNS instructions. HTTPS is automatic.

---

## 3. Render (one-click backend alternative)

`infra/render.yaml` describes a web service (`runtime: docker`) with a 1 GB
persistent disk mounted at `/data`.

1. In the Render dashboard: **New → Blueprint** and paste the repo URL, or use
   the Render API. Set the following env vars in the dashboard:
   - `JWT_SECRET` (generate with `openssl rand -hex 32`)
   - `CORS_ORIGIN` = your frontend origin
   - `DATABASE_URL` = `file:/data/app.db` (already in the blueprint)
   - `BILLING_CRON_ENABLED` = `true`
2. Render builds `backend/Dockerfile` and mounts the disk at `/data`.
3. Open `https://<service>.onrender.com/api/v1/health` to verify.

Render disk note: **free-tier disks are erased on deploy**; use at least the
Starter plan for durable storage, and keep nightly backups
(`scripts/backup-sqlite.sh`).

---

## 4. Local Docker (sanity check the image)

```bash
docker build -f backend/Dockerfile .
docker compose up --build        # backend :4000 + frontend :5173
npm run docker:up                # same thing
```

The image runs as a non-root user, applies `prisma migrate deploy` at boot, and
stores the database + uploads under `/data` (named volume in compose).

---

## 5. Nightly backups

SQLite lives on a single persistent volume, so back it up:

```bash
# On the Fly machine (or from a dev box with network access to the volume via
# `fly ssh sftp`), run the included script nightly:
DB_FILE=/data/app.db ./scripts/backup-sqlite.sh s3://opencode-shop-backups/app.db
```

Set this up with a Fly scheduled task or a cron on your own VM. See
`docs/MIGRATION.md` Stage 1 for details.
