# Decisions

Assumptions and trade-offs made while building OpenCode Shop, where the spec
left room for interpretation. Everything here follows the "simplest robust
option" rule.

## Domain / data

- **Statuses & roles are `String`, not Prisma enums.** SQLite has no native
  enum type; Prisma maps enums to `TEXT` with an app-level check anyway. We
  store strings and centralise the allowed values in
  `backend/src/domain/constants.ts` (`ROLE`, `ORDER_STATUS`,
  `INVOICE_STATUS`, `LOW_STOCK_THRESHOLD = 5`).
- **Money is integer cents everywhere** (`priceCents`, `totalCents`,
  `lineTotalCents`). No floats. Display formatting happens only in the UI
  (`formatMoney` → `RM x.xx`).
- **IDs are cuid strings** (Prisma default) — orders additionally get a
  human-readable `orderNumber` (e.g. `100001`) and a 6-char base32
  `pickupCode`.
- **`subtotalCents === totalCents`** — no taxes/delivery fees are modelled, so
  the total is just the sum of line items. Both columns exist so the schema
  survives pricing changes.
- **Inactive (soft-deleted) foods** keep their rows; `DELETE /admin/foods/:id`
  flips `isActive = false`. Order history keeps `nameSnapshot` prices, so past
  orders don't change when a food is edited/deleted.
- **Stock movements** are written for every stock change (order, cancel,
  admin set/adjust, seed) with `reason` strings (`ORDER`, `CANCEL`,
  `ADMIN_SET`, `INITIAL_STOCK`, `SEED_ORDER`, …) for auditing.

## Auth

- **Register creates the user first, then issues an OTP.** The user is
  `isActive = true` immediately but cannot do anything until they verify
  (`verify-otp`). A `USER_EXISTS` 409 prevents duplicate phones/emails.
- **`verify-otp` on an unregistered phone returns 404 `NOT_REGISTERED`** — this
  doubles as the auto-login signal for the "login or register" flow.
- **Requesting a new OTP invalidates previous unconsumed codes** for that
  phone, so a user can never verify with a stale code.
- **Refresh tokens are bcrypt-hashed at rest** and rotated on every `/refresh`.
- OTP delivery abstracts behind `services/sms/SmsProvider.ts`; `ConsoleSmsProvider`
  is the default and `TwilioSmsProvider` is stubbed (not wired to a real account).

## Ordering

- **Interactive transaction + retry.** Stock is re-read inside the transaction,
  decremented atomically, and the order + items + stock_movement are written in
  one commit. SQLite's `SQLITE_BUSY` on concurrent writers is handled with a
  small retry loop, which makes the "last unit, two parallel orders" case
  exactly-one-wins (verified by test).
- **Out-of-stock items are rejected with 409** and a machine-readable
  `{ code: "OUT_OF_STOCK", items: [{ foodId, name, requested, available }] }`
  payload so the UI can highlight exactly what failed.
- **Cancellation** is only allowed for the owner on a `PENDING` order and
  restores stock transactionally.
- **Fulfilment toggles** (`PENDING → FULFILLED → PENDING`) with `fulfilledAt`
  set/cleared, and only `FULFILLED` orders count for billing.

## Billing

- **Monthly close** aggregates `FULFILLED` orders by `(userId, periodYear,
  periodMonth)` and is idempotent (unique constraint + skip-if-exists). The
  cron runs on the 1st at 02:00 when `BILLING_CRON_ENABLED=true`.
- **Mock bank provider** always succeeds except for account numbers ending in
  `0000` (deterministic FAILED path). Returns a fake `bankRef`.
- **Invoices are created as `DRAFT` then charged immediately** during a billing
  run; `POST /admin/invoices/:id/charge` retries `FAILED` invoices only.

## Frontend

- **Tokens:** access token in memory (module-level `store`), refresh token in
  `localStorage`, axios response interceptor retries once on 401 by calling
  `/auth/refresh`.
- **Cart** is persisted to `localStorage` (key `oshop_cart`) so a refresh keeps
  the basket; stock caps are enforced on add/update.
- **Dev OTP UX:** with `OTP_MODE=console` the returned `devCode` is shown in a
  green box on the login/register screens (mirrors the API behaviour).
- **Currency formatting** uses `Intl.NumberFormat('en-MY', { currency: 'MYR' })`
  → `RM 8.90`. Note it renders with a non-breaking space (`RM\u00A08.90`) —
  tests assert with regex.

## Infra / deployment

- **`prisma` moved to `dependencies`** (not dev) so `docker-entrypoint.sh` can
  run `prisma migrate deploy` at container start with `--omit=dev` deps.
- **Dockerfile builds from the repo root** (`docker build -f backend/Dockerfile .`)
  — Fly's remote builder and Render use the whole repo as the build context, so
  the Dockerfile `COPY`s are `backend/`-prefixed and the repo-root `.dockerignore`
  applies. It uses `npm install` when no lockfile is present and `npm ci`
  otherwise. Docker is not installed in the dev environment, so `docker build`
  is authored and syntax-checked but not executed here.
- **SQLite on a volume** is the deployed reality (`/data/app.db`, `UPLOAD_DIR=/data/uploads`);
  the migration pathway to Turso/Postgres is documented in `docs/MIGRATION.md`.
- **CORS** is allowlisted and configurable via `CORS_ORIGIN` (comma-separated).
- **Food images** are generated SVGs (no network needed), seeded idempotently
  and gitignored — `db:seed` regenerates them on a fresh checkout.

## Not done / left for production

- npm audit findings are **not** fixed (would require breaking major upgrades);
  see `docs/SECURITY.md`.
- Real Twilio SMS and real bank charging are stubbed behind provider interfaces.
- `npm run db:setup` is **not** added to the root package.json (would duplicate
  `db:migrate` + `db:seed`); quickstart documents the two-step equivalent.
