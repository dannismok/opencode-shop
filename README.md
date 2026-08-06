# OpenCode Shop — Fast Food Pre-Order & Pickup System

A complete order-ahead fast food system with phone + OTP login, cart-based
ordering with transactional stock checks, admin fulfilment, and **monthly
billing** against a stored bank account (mock provider — no real payments).

## What's inside

- **Backend** (`backend/`) — Node 20 + TypeScript + Express 4 + Prisma (SQLite
  by default, Postgres-ready), zod validation, JWT + rotating refresh tokens,
  bcrypt-hashed OTPs, multer image uploads, pino logging, node-cron billing job.
- **Frontend** (`frontend/`) — React 18 + Vite + TypeScript, TailwindCSS v3,
  React Router v6, TanStack Query, Context-based auth + cart, react-hot-toast.
- **Infra** — Dockerfile + `docker-compose.yml`, `fly.toml` (Fly.io),
  `infra/render.yaml`, the repo-root `vercel.json`, GitHub Actions CI.

## Architecture

```
┌────────────────────────────┐         ┌─────────────────────────────┐
│  Browser (React SPA)       │  HTTPS  │  Express API (Node 20)      │
│  localhost:5173            │ ──────▶ │  localhost:4000  /api/v1    │
│  Vercel (prod)             │         │  Fly.io / Render (prod)     │
└────────────────────────────┘         │                             │
                                       │  Auth (OTP + JWT)           │
                                       │  Orders (tx stock checks)   │
                                       │  Billing (monthly, mock)    │
                                       │  Uploads  /uploads          │
                                       └──────────┬──────────────────┘
                                                  │ Prisma
                                       ┌──────────▼──────────────────┐
                                       │  SQLite (dev / volume)      │
                                       │  /data/app.db (prod volume) │
                                       │  ─▶ Postgres (Stage 3)      │
                                       └─────────────────────────────┘
```

## Prerequisites

- Node.js **20+** (tested on 20.x) and npm 10+
- Git
- (Optional) Docker + Docker Compose for the containerised quickstart

## Quickstart (local dev)

```bash
npm install          # install all workspaces
npm run db:setup     # = db:migrate + db:seed  (see below)
npm run dev          # API on :4000, web on :5173
```

> There is no root `db:setup` script by default — run the two steps explicitly:
> `npm run db:migrate` then `npm run db:seed`. (`npm run db:reset` wipes the
> SQLite database, re-runs migrations and seeds in one shot.)

Then open **http://localhost:5173**.

## Environment variables

Copy `backend/.env.example` to `backend/.env` (values are optional — sane
defaults exist for development).

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `4000` | API port |
| `LOG_LEVEL` | `info` | pino log level |
| `DATABASE_URL` | `file:./dev.db` | SQLite URL (see `docs/MIGRATION.md` for Postgres) |
| `JWT_SECRET` | `change-me-in-production` | **Set a strong value in prod** |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `30d` | Refresh token lifetime |
| `OTP_MODE` | `console` | `console` (log + return code in dev) or `twilio` |
| `OTP_TTL_MINUTES` | `5` | OTP expiry |
| `OTP_MAX_ATTEMPTS` | `3` | Max wrong attempts per code |
| `OTP_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window for OTP requests |
| `OTP_RATE_LIMIT_MAX` | `3` | Max OTP requests per phone/IP per window |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `100` | Global API rate limit |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `UPLOAD_DIR` | `uploads` | Where food images are stored/served |
| `MAX_IMAGE_SIZE_MB` | `2` | Upload size limit (jpg/png/webp) |
| `BILLING_CRON_ENABLED` | `false` | Run the monthly billing cron (1st, 02:00) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | — | For the Twilio SMS provider |

Frontend: `frontend/.env` → `VITE_API_BASE_URL` (empty = same origin, used
with the Vite dev proxy to `http://localhost:4000`).

## Seeded demo data

After `npm run db:reset` / `db:seed`, the following data exists:

| Role | Name | Phone | Email | Notes |
| --- | --- | --- | --- | --- |
| Admin | System Admin | `+60100000000` | `admin@example.com` | account `000000000000` |
| Customer | Ali Bin Ahmad | `+60123456789` | `ali@example.com` | account `555511112222` |
| Customer | Siti Nurhaliza | `+60129876543` | `siti@example.com` | account `999988887777` |
| Customer | Raj Kumar | `+60137654321` | `raj@example.com` | account `444433330000` — **invoice FAILED by design** |

5 food items (Classic Cheeseburger, Crispy Fried Chicken, Pepperoni Pizza
Slice, Loaded Hot Dog, Golden French Fries) with generated SVG images, ~6
orders across statuses (some fulfilled last month), and 1 CHARGED + 1 FAILED
invoice for last month.

> **OTP in dev:** with `OTP_MODE=console` and `NODE_ENV != production`, every
> OTP is printed to the API console **and** returned as `devCode` in the
> `request-otp` / `register` response, so you can log in without an SMS
> gateway. Use `devCode` (e.g. in the login page it is shown in a green box).

## API reference (prefix `/api/v1`)

Error envelope for all failures:

```json
{ "error": { "code": "OUT_OF_STOCK", "message": "…", "details": { } } }
```

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | Health check |
| POST | `/auth/request-otp` | — | `{ phone }` → sends OTP |
| POST | `/auth/verify-otp` | — | `{ phone, code }` → access + refresh tokens |
| POST | `/auth/register` | — | `{ name, email, phone, accountNumber }` → OTP |
| POST | `/auth/refresh` | — | `{ refreshToken }` → rotated token pair |
| POST | `/auth/logout` | — | `{ refreshToken }` → revoke |
| GET | `/foods` | — | Public menu (active items + stock) |
| GET | `/foods/:slug` | — | Single item |
| GET | `/me` | C | Profile |
| PATCH | `/me` | C | Update name / email / accountNumber |
| POST | `/orders` | C | `{ items:[{foodId,quantity}], notes? }` → order |
| GET | `/orders` | C | Own orders (paginated) |
| GET | `/orders/:id` | C | Own order detail |
| POST | `/orders/:id/cancel` | C | Cancel own PENDING order (restores stock) |
| GET | `/invoices` | C | Own invoices |
| GET/POST | `/admin/foods` | A | List / create food |
| GET/PATCH/DELETE | `/admin/foods/:id` | A | Get / update / soft-delete |
| POST | `/admin/foods/:id/image` | A | Upload image (multipart, max 2 MB) |
| PATCH | `/admin/foods/:id/stock` | A | `{ mode:"set", qty }` or `{ mode:"adjust", delta, reason }` |
| GET | `/admin/orders` | A | All orders (`?status=&q=&from=&to=&page=`) |
| PATCH | `/admin/orders/:id/status` | A | `{ status:"FULFILLED" | "PENDING" }` |
| GET | `/admin/users` | A | User search by phone/name |
| GET | `/admin/invoices` | A | Invoices (`?status=&year=&month=`) |
| POST | `/admin/billing/run` | A | `{ year, month }` → close month (idempotent) |
| POST | `/admin/invoices/:id/charge` | A | Retry a FAILED invoice |
| GET | `/admin/stats` | A | Dashboard stats (orders today, MTD revenue, low stock) |

C = customer token, A = admin token, — = public.

## Running the tests

```bash
npm test          # backend (Supertest) + frontend (Testing Library)
npm run lint      # ESLint (both workspaces)
npm run typecheck # tsc (both workspaces)
npm run build     # production builds (both workspaces)
```

Backend suite runs against an isolated temp SQLite file per run. It covers the
OTP auth flow, transactional order placement (including **concurrent orders for
the last unit — exactly one wins**), stock restore on cancel, admin fulfilment,
and the monthly billing run (idempotency + mock bank failure).

## Deployment

- **Backend → Fly.io** with a persistent volume for SQLite, **Frontend → Vercel**.
  Copy-paste commands: see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- Render one-click alternative: `infra/render.yaml`.
- Docker locally: `npm run docker:up` (`docker compose up --build`).

## Screenshots

_Screenshots to be added — run `npm run dev` and capture the menu, cart,
order list, admin dashboard and invoice screens._

## Troubleshooting

- **`prisma migrate` cannot find schema** — run commands from the repo root
  (`npm run db:...`), which targets the `backend` workspace.
- **CORS errors in the browser** — make sure `CORS_ORIGIN` includes the exact
  frontend origin, comma-separated for multiple origins.
- **OTP never arrives** — confirm `OTP_MODE=console` and `NODE_ENV=development`,
  then check the API console / `devCode` in the response.
- **`SQLITE_BUSY` under load** — expected with SQLite's single-writer model; the
  order service retries the interactive transaction. Scale by moving to
  Postgres (see `docs/MIGRATION.md`).
- **Uploads 404 after deploy** — `UPLOAD_DIR` must point at a persistent
  location (`/data/uploads` in the Docker image).

## Further reading

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Fly.io + Vercel + Render, step by step
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — SQLite → Turso → Postgres data pathway
- [`docs/HOSTING_OPTIONS.md`](docs/HOSTING_OPTIONS.md) — hosting comparison + recommendation
- [`docs/SECURITY.md`](docs/SECURITY.md) — security notes
- [`DECISIONS.md`](DECISIONS.md) — assumptions and trade-offs made
