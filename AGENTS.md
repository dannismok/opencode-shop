You are an autonomous senior full-stack engineer working inside the current empty directory
(`opencode-shop`). Build, install, test, and prepare for deployment a complete Fast Food
Pre-Order & Pickup System. Run all installation and scaffolding commands yourself.

## GROUND RULES
1. Work autonomously. Do NOT ask me questions. Every decision is already specified below; if
   something is still ambiguous, choose the simplest robust option and record it in `DECISIONS.md`.
2. Execute real shell commands (npm install, npx, mkdir, git) - do not just print instructions.
3. Do not use interactive scaffolders that block on prompts. Use non-interactive flags
   (e.g. `npm create vite@latest frontend -- --template react-ts`, `npm init -y`).
4. Money is ALWAYS stored and computed as integers in cents (never floats).
5. After each Phase: run the build/tests, fix everything until green, then `git add -A && git commit`
   with a conventional-commit message. Print a short progress summary.
6. At the very end, print: what was built, how to run it locally, test results, and the exact
   deployment steps.
7. Never commit `.env` or the SQLite `.db` file. Commit `.env.example`.

## TECH STACK (fixed - do not substitute)
- Monorepo with npm workspaces at repo root: `backend/`, `frontend/`, plus `docs/`, `infra/`.
- Backend: Node.js 20+, TypeScript, Express 4, Prisma ORM with the `sqlite` provider,
  zod for validation, jsonwebtoken for auth, bcrypt for hashing OTP/refresh tokens,
  multer for image upload, helmet, cors, express-rate-limit, pino for logging,
  node-cron for the monthly billing job.
- Frontend: React 18 + Vite + TypeScript, React Router v6, TailwindCSS v3, TanStack Query
  for data fetching, React Context for auth+cart, react-hot-toast for notifications.
- Tests: Vitest + Supertest (backend), Vitest + React Testing Library (frontend smoke tests).
- Tooling: ESLint + Prettier, `concurrently` at root to run both apps.
- Containerisation: one Dockerfile for the backend (multi-stage), `docker-compose.yml` for local.

Rationale for Prisma + SQLite: swapping `provider = "sqlite"` to `"postgresql"` later is a
one-line change, which is the migration pathway I want documented.

## DOMAIN REQUIREMENTS
### Users
- Register with: full name, email (unique), phone number (unique, E.164 normalised e.g. +60123456789),
  bank account number. All four are required.
- Login/registration is by PHONE NUMBER + OTP (no passwords).
  - `POST /auth/request-otp` generates a 6-digit code, stores a bcrypt hash of it, expiry 5 min,
    max 3 attempts, rate limited per phone/IP.
  - In development (`OTP_MODE=console`) log the OTP to the server console AND return it in the
    response body ONLY when `NODE_ENV !== 'production'`, so the flow is testable without an SMS gateway.
  - Abstract SMS behind `services/sms/SmsProvider.ts` with `ConsoleSmsProvider` (default) and a
    stubbed `TwilioSmsProvider` so a real gateway can be plugged in later.
- `POST /auth/verify-otp` returns a JWT access token (15 min) + refresh token (30 days, rotated,
  hashed in DB). Roles: `CUSTOMER` and `ADMIN`.
- Seed one admin user (phone `+60100000000`, name "System Admin", email admin@example.com,
  account number 000000000000) and 3 demo customers.

### Food items (exactly 5 seeded types, each with its own preview image)
1. Classic Cheeseburger - 8.90
2. Crispy Fried Chicken (2 pcs) - 12.50
3. Pepperoni Pizza Slice - 6.75
4. Loaded Hot Dog - 5.50
5. Golden French Fries (L) - 4.25
Each has: name, slug, description, category, priceCents, imageUrl, stockQty, isActive.
Generate 5 real placeholder JPG/PNG/SVG images yourself into `backend/uploads/foods/`
(programmatically drawn SVG->PNG or simple labelled SVGs are fine - no external network downloads
required, but if network is available you may fetch royalty-free images). Serve them statically
from `/uploads`. Seed initial stock: 25, 20, 30, 15, 40.

### Ordering
- A customer builds a cart and places ONE order containing 1..N line items (foodId + qty>=1).
- Order creation MUST run inside a single Prisma interactive transaction that:
  a) re-reads current stock, b) rejects with HTTP 409 + machine-readable
  `{ code: "OUT_OF_STOCK", items:[{foodId,name,requested,available}] }` if any item lacks stock
  or is inactive, c) decrements stock, d) writes `order` + `order_items` with price snapshots,
  e) writes a `stock_movement` audit row.
- Out-of-stock (stockQty = 0) items are shown greyed out / "Sold out" in the UI and the
  Add-to-cart button is disabled. Quantity in cart cannot exceed available stock.
- Order statuses: `PENDING` -> `FULFILLED` (picked up) or `CANCELLED`.
  Cancelling a PENDING order restores stock (transactional) and logs a stock_movement.
- Each order gets a short human-readable `pickupCode` (e.g. 6-char base32, unique).
- Customers can list and view only their own orders. Admins see all orders with filters
  (status, date range, phone search) and pagination.
- Admin marks an order fulfilled with a single button -> `PATCH /admin/orders/:id/status`
  `{ status: "FULFILLED" }`, sets `fulfilledAt`. The button toggles/undoes (FULFILLED -> PENDING)
  with a confirm dialog. Only fulfilled orders are billable.

### Stock management (admin)
- Full CRUD on food items including image upload (multer, max 2MB, jpg/png/webp only, sanitised
  filenames, stored in `backend/uploads/foods/`).
- Dedicated stock endpoints: `PATCH /admin/foods/:id/stock` with either
  `{ mode:"set", qty }` or `{ mode:"adjust", delta, reason }`. Never allow negative stock.
- Admin dashboard shows a low-stock warning badge when stockQty <= 5.

### Monthly billing (charge to bank account)
- No online payment gateway. Orders are unpaid at pickup; billing is monthly.
- `invoices` table: one invoice per user per (year, month) aggregating all orders that were
  FULFILLED in that period. Status: `DRAFT` -> `CHARGED` | `FAILED`. Stores totalCents,
  bank account snapshot, chargedAt, bankRef, failureReason.
- Abstract the bank debit behind `services/billing/BankChargeProvider.ts` with a
  `MockBankChargeProvider` (always succeeds, returns fake `bankRef`; deterministically fails for
  account numbers ending in "0000" so the FAILED path is demonstrable).
- `node-cron` job at 02:00 on the 1st of each month closes the previous month; guard it with
  `BILLING_CRON_ENABLED` env var and make it idempotent (unique constraint on userId+year+month).
- Admin can also trigger it manually: `POST /admin/billing/run { year, month }`, and
  `POST /admin/invoices/:id/charge` to retry a FAILED invoice.
- Customers can view their own invoices at `/my/invoices`.

## DATABASE SCHEMA (Prisma - implement exactly, add indexes on FKs and lookup columns)
- User(id cuid, name, email @unique, phone @unique, accountNumber, role enum, isActive,
       createdAt, updatedAt)
- OtpCode(id, phone, codeHash, expiresAt, attempts, consumedAt, createdAt) index(phone)
- RefreshToken(id, userId, tokenHash, expiresAt, revokedAt)
- Food(id, name, slug @unique, description, category, priceCents Int, imageUrl, stockQty Int,
       isActive Boolean, createdAt, updatedAt)
- Order(id, orderNumber @unique, pickupCode @unique, userId, status enum, subtotalCents,
        totalCents, notes?, createdAt, fulfilledAt?, cancelledAt?, invoiceId?)
- OrderItem(id, orderId, foodId, nameSnapshot, unitPriceCents, quantity, lineTotalCents)
- StockMovement(id, foodId, delta Int, reason String, orderId?, actorUserId?, createdAt)
- Invoice(id, userId, periodYear Int, periodMonth Int, totalCents, status enum,
          accountNumberSnapshot, chargedAt?, bankRef?, failureReason?, createdAt)
  @@unique([userId, periodYear, periodMonth])
Use Prisma Migrate (`prisma migrate dev --name init`) - real migration files, not `db push`.
Add `prisma/seed.ts` wired to `prisma.seed` in package.json, idempotent (upsert).

## REST API (prefix /api/v1, JSON, consistent error envelope { error: { code, message, details } })
Public:      GET  /health
             POST /auth/request-otp        { phone }
             POST /auth/verify-otp         { phone, code }  -> tokens (auto-login if registered)
             POST /auth/register           { name, email, phone, accountNumber } -> sends OTP
             POST /auth/refresh            { refreshToken }
             POST /auth/logout
             GET  /foods                   (public menu, only isActive, includes stock + inStock flag)
             GET  /foods/:slug
Customer:    GET  /me                      PATCH /me (name, email, accountNumber only)
             POST /orders                  { items:[{foodId, quantity}], notes? }
             GET  /orders                  (own, paginated)     GET /orders/:id
             POST /orders/:id/cancel       (only own + PENDING)
             GET  /invoices                (own)
Admin:       GET/POST/PATCH/DELETE /admin/foods[/:id]   (DELETE = soft delete via isActive)
             POST  /admin/foods/:id/image  (multipart)
             PATCH /admin/foods/:id/stock
             GET   /admin/orders  ?status=&q=&from=&to=&page=
             PATCH /admin/orders/:id/status
             GET   /admin/users   ?q=
             GET   /admin/invoices ?status=&year=&month=
             POST  /admin/billing/run      POST /admin/invoices/:id/charge
             GET   /admin/stats            (today's orders, pending count, revenue MTD, low stock)
Middleware: `requireAuth`, `requireAdmin`, zod body/query validation, centralised error handler,
request logging, 404 handler.

## FRONTEND PAGES & UX
Layout: responsive mobile-first, sticky header with cart badge, Tailwind, clean modern card UI,
accessible (labels, focus states, aria), loading skeletons and empty states everywhere.
- `/`                Menu grid: image, name, description, price, stock pill
                     ("12 left" / "Sold out"), qty stepper, Add to cart (disabled if sold out).
- `/cart`            Line items, qty edit, remove, subtotal, "Place order" (requires login).
- `/login`           Phone input -> OTP screen (6-box input, resend timer 60s).
- `/register`        Name, email, phone, bank account number -> OTP verify.
- `/orders`          My orders: order number, pickup code, date, status chip, total, expandable items.
- `/orders/:id`      Order detail + Cancel button when PENDING.
- `/invoices`        My monthly invoices with status.
- `/admin`           Stats tiles + low-stock alerts.
- `/admin/foods`     Table + create/edit modal + image upload preview + inline stock editor.
- `/admin/orders`    Filterable table with a prominent "Mark as Fulfilled" button per PENDING row
                     (and "Undo" for fulfilled) - optimistic update + toast.
- `/admin/invoices`  Invoice table, "Run monthly billing" action, "Retry charge" per FAILED row.
Protected routes via `<RequireAuth>` / `<RequireAdmin>` wrappers; tokens in memory + refresh
token in localStorage; axios/fetch interceptor auto-refreshes on 401 once.
Vite dev proxy `/api` -> http://localhost:4000. Frontend uses `VITE_API_BASE_URL`.

## SEED DEMO DATA
Admin + 3 customers, 5 foods with images, ~6 orders across statuses (some fulfilled in the
previous month), and 1 CHARGED + 1 FAILED invoice, so every screen has visible data immediately.

## TESTS (must pass)
Backend (Supertest, isolated temp SQLite file per run):
- register -> request-otp -> verify-otp -> authenticated /me
- place order happy path decrements stock correctly
- place order with quantity > stock returns 409 OUT_OF_STOCK and does NOT change stock
- ordering an item with stockQty 0 is rejected
- concurrent orders for the last unit: exactly one succeeds (fire two requests in parallel)
- cancel order restores stock
- customer cannot fulfil an order or read another user's order (403/404)
- admin fulfil sets status + fulfilledAt
- billing run creates one invoice per user with correct total, is idempotent when run twice,
  and marks FAILED for the mock-failing account
Frontend: menu renders, sold-out button disabled, cart total maths, admin fulfil button calls API (mocked).
Add `npm test` at root running both suites.

## DEPLOYMENT DELIVERABLES (prepare files, do not attempt to log into any vendor)
Primary target: **backend on Fly.io with a persistent volume** (SQLite needs a real disk),
**frontend on Vercel**. Also provide Render as the one-click alternative.
Create:
- `backend/Dockerfile` (multi-stage, node:20-alpine, `prisma migrate deploy` on start via
  `docker-entrypoint.sh`, non-root user, DB path `/data/app.db`, uploads on the volume at
  `/data/uploads` with a symlink or configurable `UPLOAD_DIR`).
- `infra/fly.toml` (app name `opencode-shop-api`, internal port 4000, `[mounts] source="data"
  destination="/data"`, health check on /api/v1/health, `auto_stop_machines=false`).
- `infra/render.yaml` (web service + 1GB persistent disk mounted at /data).
- `frontend/vercel.json` (SPA rewrite to /index.html) and `.env.production` example.
- `docker-compose.yml` for local: backend + frontend, named volume for /data.
- `.github/workflows/ci.yml`: install, lint, typecheck, test, build on push/PR.
- `.dockerignore`, `.gitignore`, root `.editorconfig`.

## DOCUMENTATION (write these files properly, not stubs)
- `README.md` - overview, architecture diagram (ASCII), prerequisites, quickstart
  (`npm install`, `npm run db:setup`, `npm run dev`), env var table, seeded demo logins with
  the OTP-in-console note, full API table, screenshots placeholder section, troubleshooting.
- `docs/DEPLOYMENT.md` - exact copy-pasteable commands for Fly.io (`fly launch --no-deploy`,
  `fly volumes create data -s 1`, `fly secrets set JWT_SECRET=...`, `fly deploy`) and for Vercel
  (`vercel --prod`, setting `VITE_API_BASE_URL`), plus CORS/origin config, custom domain + HTTPS
  notes, and the Render alternative.
- `docs/MIGRATION.md` - the staged data pathway:
    Stage 0 local SQLite file (dev)
    Stage 1 SQLite on a Fly.io/Render persistent volume + nightly `sqlite3 .backup` to object
            storage (script `scripts/backup-sqlite.sh`), limits: single writer, one machine only,
            no horizontal scaling.
    Stage 2 (if you need serverless/multi-region reads) -> Turso / libSQL: same SQL dialect,
            `@libsql/client` + Prisma driver adapter, `turso db shell < dump.sql`.
    Stage 3 (recommended long-term) -> PostgreSQL on Neon/Supabase/Fly Postgres:
            change `provider` to `postgresql`, regenerate the initial migration for Postgres,
            export with `sqlite3 app.db .dump`, transform with `pgloader` (give the exact
            `pgloader sqlite://./app.db postgresql://...` command and the gotchas:
            BOOLEAN 0/1, DATETIME->timestamptz, AUTOINCREMENT->identity, quoting),
            verify row counts, then flip `DATABASE_URL`. Include a rollback plan and a
            zero-downtime cutover checklist (maintenance window vs dual-write).
    Also cover moving `uploads/` from local disk to S3/Cloudflare R2 with a signed-URL
            `StorageProvider` abstraction (leave the interface in the code, local disk as default).
- `docs/HOSTING_OPTIONS.md` - comparison table (free tier, persistent disk?, cold starts, price
  at scale, ease) for: Fly.io, Render, Railway, DigitalOcean App Platform, Hetzner/VPS+Caddy,
  Vercel/Netlify/Cloudflare Pages (frontend only), Turso, Neon, Supabase. End with a clear
  recommendation: "Start: Fly.io (API+volume) + Vercel (SPA). Scale: Fly.io + Neon Postgres +
  Cloudflare R2." Justify it in 3-5 bullets.
- `AGENTS.md` - conventions, commands, folder map, so future agent sessions stay consistent.
- `DECISIONS.md` - assumptions and trade-offs you made.
- `SECURITY.md` - short note on JWT rotation, OTP brute-force limits, no card data stored,
  bank account numbers should be encrypted/tokenised before real production use.

## ROOT PACKAGE SCRIPTS
`dev` (concurrently both), `dev:api`, `dev:web`, `build`, `test`, `lint`, `format`, `typecheck`,
`db:migrate`, `db:seed`, `db:reset`, `db:studio`, `docker:up`.

## EXECUTION PLAN (do these in order, commit after each)
Phase 0  `git init`, root package.json with workspaces, .gitignore, .editorconfig, Prettier, ESLint.
Phase 1  Backend scaffold: express + TS + tsx watch, config loader with zod-validated env,
         logger, error handler, /health. Verify it boots on port 4000.
Phase 2  Prisma schema + initial migration + seed (incl. generated food images). Verify with
         `prisma migrate dev` and a `db:seed` run; confirm rows exist.
Phase 3  Auth module (OTP, JWT, refresh, roles) + middleware + tests.
Phase 4  Foods (public + admin CRUD, image upload) + stock endpoints + tests.
Phase 5  Orders (transactional stock check, cancel, admin fulfil) + tests incl. the concurrency test.
Phase 6  Invoices + billing service + mock bank provider + cron + tests.
Phase 7  Frontend scaffold (Vite, Tailwind, router, layout, api client, auth+cart contexts).
Phase 8  Customer screens (menu, cart, checkout, orders, invoices) + frontend tests.
Phase 9  Admin screens (dashboard, foods+stock, orders with fulfil button, invoices).
Phase 10 Docker, fly.toml, render.yaml, vercel.json, compose, CI workflow, backup script.
Phase 11 All docs (README, DEPLOYMENT, MIGRATION, HOSTING_OPTIONS, AGENTS, DECISIONS, SECURITY).
Phase 12 Final verification: fresh `npm install`, `npm run db:reset`, `npm run build`,
         `npm test`, `npm run lint`, start the server and run a curl smoke script
         (`scripts/smoke.sh`: health -> register -> otp -> order -> admin fulfil -> billing run),
         then print the final report.

## DEFINITION OF DONE
- `npm install && npm run db:reset && npm run dev` gives a working app at
  http://localhost:5173 (web) and http://localhost:4000 (api).
- All tests, typecheck and lint pass. `npm run build` succeeds for both workspaces.
- A user can register with phone+OTP, order 2+ items, see the order; the item's stock drops;
  a sold-out item cannot be ordered; the admin can update stock and toggle the order to fulfilled;
  monthly billing produces an invoice charged against the user's bank account (mock).
- Docker image builds successfully (`docker build ./backend`).
- Deployment + migration docs are complete and copy-pasteable.
Start with Phase 0 now.