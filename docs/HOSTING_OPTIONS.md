# Hosting Options

Comparison for running the OpenCode Shop backend (Node/Express + SQLite) and
frontend (React SPA). Prices are indicative (2026) and change often — verify on
the vendor sites before committing.

## Backend (API + database + uploads)

| Platform | Free tier? | Persistent disk? | Cold starts | Price at scale | Ease |
| --- | --- | --- | --- | --- | --- |
| **Fly.io** | Tiny monthly credit; ~$5/mo min for always-on | **Yes** — volumes (this project uses one) | No (long-running machine) | ~$5–15/mo for 1 small VM + volume | Medium (CLI, config) |
| **Render** | Yes (spins down, 750 h/mo) | Yes on paid plans; **free disks are ephemeral** | Yes after idle | ~$7/mo for Starter + disk | Easy (blueprint) |
| **Railway** | Yes (trial credits, then metered) | Yes (volumes) | Yes after idle | Usage-based; can be cheap or expensive | Easy |
| **DigitalOcean App Platform** | No | Yes | — | $5+/mo basic | Easy |
| **Hetzner / VPS + Caddy** | No | Yes (whole disk) | No | ~$4–8/mo for a 2 vCPU/4 GB VPS | Hardest (you run everything) |
| **Vercel / Netlify / Cloudflare Pages** | Yes | **No** (functions + KV/R2 only) | Yes (functions) | Not suitable for a stateful API with a file DB | N/A for this backend |

## Databases (for Stage 2/3)

| Platform | Free tier? | Notes |
| --- | --- | --- |
| **Turso** | Generous free tier | libSQL/SQLite dialect, multi-region reads, edge-ready |
| **Neon** | Free tier (branching, autosuspend) | Postgres, serverless |
| **Supabase** | Free tier | Postgres + auth + storage in one |
| Fly Postgres | Not free | Managed Postgres on Fly machines |

## Recommendation

> **Start: Fly.io (API + volume) + Vercel (SPA). Scale: Fly.io + Neon Postgres + Cloudflare R2.**

Why:

1. **SQLite needs a real disk**, and Fly volumes are the cheapest reliable
   always-on persistent storage for a single-writer database. Render's free
   disks are ephemeral (erased on deploy), which silently loses data — a
   non-starter without backups.
2. **Vercel is the simplest home for a Vite SPA** — one command deploy,
   automatic HTTPS, no cold-start concerns for static assets, and the repo-root
   `vercel.json` rewrites make deep links work for free.
3. **Fly's config-driven deploys** (`fly.toml` at the repo root) map 1:1 to the
   included
   Dockerfile, and `fly volumes` + secrets make the DB/upload lifecycle
   explicit and auditable.
4. **When you outgrow single-writer SQLite**, the same Fly app points at a
   Neon Postgres database via a one-line Prisma change, and uploads move to R2
   behind the existing `StorageProvider` abstraction — no re-architecture.
5. **Avoid the traps:** serverless hosts (Vercel/Netlify/Cloudflare Pages) and
   ephemeral-disk free tiers are where a filesystem-backed app like this one
   loses data. Pay for a disk, or move the stateful parts to managed services.
