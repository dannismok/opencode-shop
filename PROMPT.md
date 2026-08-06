# PROMPT — Build "Unisoft Food Store"

A self-contained spec for recreating the **Unisoft Food Store** project: a Fast
Food Pre-Order & Pickup System with monthly billing. Use this as the build
prompt for an AI coding agent or a developer. Current live deployment:
backend on **Fly.io**, frontend on **Vercel**.

---

## Product brief

Build a web app for a fast-food chain where customers can **pre-order food for
pickup**, and the shop charges them **once per month** against a stored bank
account number (mock provider — no real payments). The app must feel like a
complete, production-shaped product, not a toy demo.

- **Brand name:** Unisoft Food Store (browser tab title, header, footer).
- **Market:** Hong Kong — display prices in **HKD (HK$)**.
- **Menu language:** product names and descriptions in **Chinese (traditional)**;
  the login page shows a Chinese demo-guide box (demo accounts, password,
  login steps). The rest of the UI chrome may be English.
- **Demo-first:** it must be usable without any SMS gateway — OTP codes are
  returned in the API response and shown on the login screen.

## Stack (fixed)

- Monorepo via **npm workspaces**: `backend/`, `frontend/`.
- **Backend:** Node 20+ / TypeScript / Express 4 / **Prisma + SQLite**
  (Postgres-ready) / zod / jsonwebtoken / bcrypt / multer / helmet / cors /
  express-rate-limit / pino / node-cron.
- **Frontend:** React 18 + Vite + TypeScript / React Router v6 / TailwindCSS v3 /
  TanStack Query / React Context (auth + cart) / react-hot-toast.
- **Tests:** Vitest + Supertest (backend), Vitest + React Testing Library (frontend).

## Non-negotiable rules

1. **Money is integer cents only** (`priceCents`, `totalCents`, …). Never floats.
2. **Never commit** `.env`, SQLite `.db` files, `node_modules`, or `dist`.
   Do commit `.env.example` / `*.env.example` templates.
3. **Run lint + typecheck + tests + build after every change; keep them green.**
4. Conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
5. Run npm commands from the repo root: `npm run <script> -w backend`.

## Data model (Prisma, SQLite datasource)

- **User** — name, email, phone (unique), accountNumber, passwordHash,
  role (`ADMIN` | `CUSTOMER`), isActive. Roles/statuses are **String** columns,
  constants centralised in `backend/src/domain/constants.ts`
  (`ROLE`, `ORDER_STATUS` PENDING/FULFILLED/CANCELLED, `INVOICE_STATUS`
  DRAFT/CHARGED/FAILED, `LOW_STOCK_THRESHOLD = 5`).
- **Food** — name, slug (unique), description, category, priceCents,
  stockQty, baseStock, imageUrl, isActive (soft delete).
- **Order** — orderNumber (unique, human-readable), user, status, subtotalCents,
  totalCents, notes, pickupCode (6-char base32), createdAt, fulfilledAt.
  Line items store **price/name snapshots** (`OrderItem`).
- **StockMovement** — food, delta, reason, orderId? — audit for every stock change.
- **Invoice** — user, periodYear, periodMonth, totalCents, status,
  accountNumberSnapshot, bankRef, **`@@unique([userId, periodYear, periodMonth])`**
  (idempotent monthly billing).
- **OtpCode** — phone, codeHash (bcrypt), expiresAt, attempts, consumedAt.

## Backend behaviour

**Auth (phone + OTP, no password login):**
- `POST /auth/register` creates the user then issues an OTP
  (409 `USER_EXISTS` on duplicate phone/email).
- `POST /auth/request-otp` sends an OTP; **requesting a new one invalidates
  previous unconsumed codes** for that phone.
- `POST /auth/verify-otp` returns access (in-memory) + refresh (localStorage)
  tokens; on an unregistered phone it returns 404 `NOT_REGISTERED` (doubles as
  the auto-login signal).
- `POST /auth/refresh` rotates a **bcrypt-hashed** refresh token; `/auth/logout` revokes.
- **Demo mode:** `OTP_MODE=console` (default) returns the code as `devCode` in
  the response and the login page shows it in a green box. `OTP_MODE=twilio`
  hides `devCode` (SMS provider is a stub).

**Orders (transactional + stock audit):**
- Placed in a single Prisma interactive transaction: re-read stock, reject with
  `409 OUT_OF_STOCK` (`{ code, items:[{foodId,name,requested,available}] }`),
  decrement stock, write order + line items + `stock_movement` (reason `ORDER`).
- Retry on `SQLITE_BUSY` so two parallel orders for the last unit are
  exactly-one-wins (covered by a test).
- Cancel only by owner on `PENDING`; restores stock (reason `CANCEL`).
- Admin fulfilment toggles `PENDING ↔ FULFILLED`, sets/clears `fulfilledAt`.
  Only FULFILLED orders count for billing.

**Billing (monthly close):**
- Aggregates FULFILLED orders per `(userId, periodYear, periodMonth)`,
  idempotent via the unique constraint (skip-if-exists). Cron runs on the 1st at
  02:00 when `BILLING_CRON_ENABLED=true`.
- Mock bank provider: always succeeds except account numbers ending in `0000`
  (deterministic FAILED path) → `POST /admin/invoices/:id/charge` retries FAILED.

**Foods admin:** CRUD, soft-delete, multer image upload (2 MB jpg/png/webp,
sanitised filename → `UPLOAD_DIR`, served from `/uploads` with
`Cross-Origin-Resource-Policy: cross-origin` so the frontend can load them),
stock set/adjust endpoints.

**API surface (prefix `/api/v1`):** health, auth (register/request-otp/
verify-otp/refresh/logout), foods (+slug), me, orders (+/:id/cancel),
invoices, admin/foods (+image, +stock), admin/orders (+status), admin/users,
admin/invoices, admin/billing/run, admin/invoices/:id/charge, admin/stats.
Error envelope: `{ "error": { "code", "message", "details" } }`.

## Frontend behaviour

- **Pages:** Home/menu, Cart, Login, Register, Orders (+detail), Invoices,
  and an admin section (Dashboard with stats, Foods CRUD, Orders, Invoices).
- **Auth:** access token in memory, refresh token in `localStorage`, axios
  interceptor retries once on 401 via `/auth/refresh`.
- **Cart:** persisted to `localStorage` (key `oshop_cart`), stock-capped.
- **Money display:** `Intl.NumberFormat('en-HK', { currency: 'HKD' })` → `HK$8.90`.
- **Images:** food image URL resolved against `VITE_API_BASE_URL`.
- **Login page demo box (Chinese):** lists demo accounts
  (admin `+60100000000`; customers `+60123456789`, `+60129876543`,
  `+60137654321`), demo password `Password123!`, and steps:
  输入电话 → 发送验证码 → 输入画面显示的验证码.

## Seeded demo data (idempotent — `db:seed` is safe to re-run)

- 4 users (1 admin + 3 customers, bcrypt `Password123!`).
- **6 foods with Chinese names/descriptions** and generated SVG images
  (emoji rendered via `<foreignObject>`, name overlaid):
  經典芝士漢堡, 脆皮炸雞（2件）, 辣肉腸薄餅（單片）, 足料熱狗,
  黃金薯條（大）, 芒果西米露.
- ~6 demo orders across statuses (some fulfilled last month); 1 CHARGED +
  1 FAILED invoice for last month (Raj's account ends `0000` → FAILED by design).
- **Idempotency:** foods/users upsert by slug/phone; demo orders use
  deterministic `SEED-<phone>-<index>` order numbers so re-seeding creates
  0 new orders; images only written when missing.

## Conventions & gotchas

- SQLite has no enums — use `String` + constants.
- Seed order numbers must be **deterministic** (do not reuse the random
  `OS-YYYYMMDD-xxxxx` generator, or re-runs duplicate orders).
- Assert money with regex, not exact strings.
- Run `db:seed` from the repo root (`npm run db:seed -w backend`).

## Deployment

- **Backend → Fly.io:** `fly.toml` at repo root; multi-stage Dockerfile
  (`backend/Dockerfile`) builds from the repo root, runs `prisma migrate
  deploy` in the entrypoint, runs as non-root; SQLite at `/data/app.db`,
  uploads at `/data/uploads` on a persistent volume. Set `JWT_SECRET`,
  `CORS_ORIGIN=https://<frontend>.vercel.app` as secrets.
- **Frontend → Vercel:** repo-root `vercel.json` — build **only** the frontend
  (`npm run build -w frontend`, output `frontend/dist`) + SPA rewrites to
  `/index.html`. Committed `frontend/.env.production` sets
  `VITE_API_BASE_URL=https://<api>.fly.dev`.
- **CI/CD:** GitHub Actions — `ci.yml` (lint/typecheck/test/build) and
  `deploy.yml` (deploy backend to Fly on push to main). Vercel deploys are
  manual (`npx vercel --prod --yes`).

## Post-build gate

`npm run lint && npm run typecheck && npm test && npm run build` — all green,
then commit.
