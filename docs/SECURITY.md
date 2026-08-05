# Security Notes

A pragmatic rundown of how this system keeps money, phones and tokens safe —
and what to do before real production use.

## Auth & tokens

- **JWT access tokens** (15 min) are signed with `JWT_SECRET`. Store them in
  memory in the SPA (never `localStorage` for the access token).
- **Refresh tokens** (30 days) are opaque random strings, **hashed with bcrypt**
  in the DB, rotated on every refresh (old hash revoked, new one issued), and
  revoked on logout. A leaked refresh token can only be used before rotation.
- `JWT_SECRET` must be a strong, unique value in production
  (`openssl rand -hex 32`) and delivered via secrets (Fly secrets / Render env /
  CI variables) — never in the repo.

## OTP & brute-force protection

- 6-digit codes are stored as **bcrypt hashes** with a 5-minute expiry.
- Max **3 attempts** per code; a new request invalidates prior unconsumed codes.
- **Rate limiting** per phone+IP on `request-otp` / `register`
  (`OTP_RATE_LIMIT_MAX`), plus a global API rate limit.
- In dev (`OTP_MODE=console`, `NODE_ENV != production`) the code is logged and
  returned as `devCode` for testability. **`NODE_ENV=production` disables the
  devCode leak automatically.**

## Money & card data

- **No card data is ever collected or stored.** Billing is a monthly charge to
  a bank account.
- All money is **integer cents** end-to-end (`priceCents`, `totalCents`,
  `lineTotalCents`) — no floats, no rounding drift.

## Bank account numbers

- Required at registration (8–20 digits, validated), stored in the `User` row
  and snapshotted per invoice (`accountNumberSnapshot`).
- **Before real production:** encrypt or tokenise account numbers at rest
  (e.g. field-level encryption with a separate KMS key, or store a token from
  the bank partner). Mask in any logs/UI (`••••1234`).
- The mock `BankChargeProvider` demonstrates the FAILED path for account
  numbers ending in `0000` — replace it with a real gateway integration behind
  the same interface.

## Headers & transport

- `helmet` sets security headers; CORS is allowlisted via `CORS_ORIGIN`
  (comma-separated, no wildcard in production).
- `express-rate-limit` guards every endpoint; uploads are size-capped (2 MB,
  jpg/png/webp) with sanitised filenames and only served from `/uploads`.
- Production should be HTTPS-only (Fly and Vercel do this automatically).

## Dependencies & audits

- `npm audit` reports vulnerabilities in the dependency tree. This project
  deliberately ships with them unresolved (the audit fix would require breaking
  major upgrades). **Run `npm audit` and resolve before production traffic.**

## Incidents

- DB backups live in object storage (`scripts/backup-sqlite.sh`); restore =
  copy back and redeploy the volume.
- If `JWT_SECRET` leaks: rotate it (logs everyone out) and rotate all refresh
  tokens (delete `RefreshToken` rows).
