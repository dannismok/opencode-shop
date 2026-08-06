# AGENTS.md — Project Conventions

This is the OpenCode Shop repo: a Fast Food Pre-Order & Pickup System with
monthly billing. It is **built and committed**; future sessions should extend,
fix, and operate it consistently. The original build spec is preserved in git
history (first commit) and summarised in `DECISIONS.md`.

## Stack (fixed)

- Monorepo via **npm workspaces** (`backend/`, `frontend/`).
- Backend: Node 20+ / TypeScript / Express 4 / **Prisma + SQLite**
  (Postgres-ready) / zod / jsonwebtoken / bcrypt / multer / helmet / cors /
  express-rate-limit / pino / node-cron.
- Frontend: React 18 + Vite + TypeScript / React Router v6 / TailwindCSS v3 /
  TanStack Query / React Context (auth + cart) / react-hot-toast.
- Tests: Vitest + Supertest (backend), Vitest + React Testing Library (frontend).

## Non-negotiable rules

1. **Money is integer cents only** (`priceCents`, `totalCents`, …). Never floats.
2. **Never commit** `.env`, SQLite `.db` files, `node_modules`, or `dist`.
   Do commit `.env.example` and `*.env.example` templates.
3. **Run builds/tests after every change** and keep them green before commit.
4. Commit with conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
5. Run npm commands from the **repo root** (`npm run <script> -w backend`), not
   from inside a workspace directory.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API (`:4000`) + web (`:5173`) via concurrently |
| `npm run dev:api` / `dev:web` | One side only |
| `npm run build` | Production builds for both workspaces |
| `npm test` | Backend + frontend test suites |
| `npm run lint` | ESLint, both workspaces |
| `npm run typecheck` | `tsc --noEmit`, both workspaces |
| `npm run format` | Prettier write |
| `npm run db:migrate` | `prisma migrate dev` (backend) |
| `npm run db:seed` | Run `prisma/seed.ts` (idempotent, upsert-based) |
| `npm run db:reset` | Wipe DB + migrate + seed in one shot |
| `npm run db:studio` | Prisma Studio |
| `npm run docker:up` | `docker compose up --build` |
| `npm test` | both suites (no `npm test` args needed) |

Post-change gate: `npm run lint && npm run typecheck && npm test && npm run build`.

## Folder map

```
backend/
  src/
    config/env.ts          # zod-validated env loader (defaults for dev)
    container.ts           # Deps wiring (prisma, env, logger)
    app.ts                 # express app: helmet, cors, rate limit, /uploads, routes
    index.ts               # boot: listen + billing cron
    domain/constants.ts    # ROLE, ORDER_STATUS, INVOICE_STATUS, LOW_STOCK_THRESHOLD
    lib/                   # errors, ids (orderNumber/pickupCode), logger, phone, prisma, initDb
    middleware/            # auth (requireAuth/requireAdmin), errorHandler, notFound, requestLogger, upload
    routes/                # health, auth, foods, orders, invoices (admin nested under each)
    services/              # otp, token, order, billing + sms/ storage/ billing/ providers
  prisma/
    schema.prisma          # SQLite datasource; String statuses/roles
    migrations/            # real migrations (prisma migrate dev)
    seed.ts                # admin + 3 customers, 5 foods (+SVG images), ~6 orders, invoices
    dev.db                 # local DB (gitignored)
  tests/                   # helpers.ts + auth/foods/orders/billing suites
  uploads/foods/           # generated food images (gitignored except .gitkeep)
  Dockerfile               # multi-stage, prisma migrate deploy on start, /data volume
  docker-entrypoint.sh
frontend/
  src/
    main.tsx               # providers (Query, Router, Auth, Cart) + Toaster
    App.tsx                # routes + AdminLayout
    lib/                   # api.ts (axios + refresh interceptor), types.ts, format.ts
    context/               # AuthContext.tsx, CartContext.tsx (localStorage)
    components/            # Layout, RequireAuth, OtpInput, ui (Skeleton/EmptyState/etc.)
    pages/                 # Home, Cart, Login, Register, Orders(+detail), Invoices
    pages/admin/           # Dashboard, Foods, Orders, Invoices
  vercel.json              # repo-root Vercel config: build frontend only + SPA rewrite
  .env.production.example
infra/                     # render.yaml
scripts/                   # backup-sqlite.sh, smoke.sh
docs/                      # DEPLOYMENT, MIGRATION, HOSTING_OPTIONS, SECURITY
fly.toml                   # Fly.io config (deploy with `fly deploy` from repo root)
```

## Key conventions & gotchas

- **Enums:** SQLite has no enums; use `String` + constants in
  `backend/src/domain/constants.ts`.
- **Auth flow:** `register` creates the user then issues an OTP; `verify-otp`
  on an unregistered phone returns `404 NOT_REGISTERED`. Requesting a new OTP
  invalidates old ones. Access token in memory, refresh token in `localStorage`.
- **Orders:** placed in a single Prisma interactive transaction; re-reads stock,
  rejects with `409 OUT_OF_STOCK` (`items:[{foodId,name,requested,available}]`),
  decrements stock, writes order + items (price snapshots) + stock_movement.
  Concurrent writers hit `SQLITE_BUSY` — the order service retries; tests assert
  exactly-one-wins for the last unit.
- **Money display:** `Intl.NumberFormat('en-HK', {currency:'HKD'})` renders
  `HK$8.90` — assert with regex, not exact strings.
- **Billing:** monthly close = sum of FULFILLED orders per user+period, guarded
  by `BILLING_CRON_ENABLED`, idempotent via `@@unique([userId, periodYear, periodMonth])`.
  Mock bank fails account numbers ending in `0000`.
- **Uploads:** multer 2 MB jpg/png/webp, sanitised filenames → `UPLOAD_DIR`
  (default `uploads`, production `/data/uploads`). Served from `/uploads`.
- **Prod note:** Docker image runs as non-root; DB at `/data/app.db`, uploads at
  `/data/uploads` (Fly volume / Render disk).

## Testing notes

- Backend tests use an isolated temp SQLite file per run
  (`tests/helpers.ts` `createTestContext`), seeded via `prisma migrate deploy`
  on the temp file. Tokens are signed with the test container's JWT secret.
- Frontend tests mock `src/lib/api` (`vi.mock`) and wrap components in
  `QueryClientProvider` (+ `AuthProvider`/`CartProvider` as needed).
- `react-hot-toast` is mocked in `src/test/setup.ts`.
