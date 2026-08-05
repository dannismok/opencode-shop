#!/usr/bin/env bash
# End-to-end smoke test against a running backend.
#
# Prereqs: the backend must be running with OTP_MODE=console and
# NODE_ENV != production (so request-otp returns devCode), plus `jq`.
#
# Usage: ./scripts/smoke.sh          # defaults to http://localhost:4000/api/v1
#        BASE_URL=http://localhost:4000/api/v1 ./scripts/smoke.sh
set -euo pipefail

BASE="${BASE_URL:-http://localhost:4000/api/v1}"
PHONE="${SMOKE_PHONE:-+60195550001}"
ADMIN_PHONE="+60100000000"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

json() { curl -fsS -H 'Content-Type: application/json' "$@"; }

echo "== 1. health =="
json "$BASE/health" | jq .

echo "== 2. register smoke customer =="
REG=$(json -X POST "$BASE/auth/register" \
  -d "{\"name\":\"Smoke Tester\",\"email\":\"smoke@example.com\",\"phone\":\"$PHONE\",\"accountNumber\":\"987654321000\"}")
CODE=$(echo "$REG" | jq -r '.devCode // empty')
[ -n "$CODE" ] || { echo "error: devCode missing — is OTP_MODE=console and NODE_ENV != production?" >&2; exit 1; }

echo "== 3. verify OTP and get tokens =="
TOKENS=$(json -X POST "$BASE/auth/verify-otp" -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")
TOKEN=$(echo "$TOKENS" | jq -r '.accessToken')
[ -n "$TOKEN" ] || { echo "error: no access token" >&2; exit 1; }
echo "authenticated as $(echo "$TOKENS" | jq -r '.user.name')"

echo "== 4. GET /me =="
json -H "Authorization: Bearer $TOKEN" "$BASE/me" | jq '{user:{name:.user.name,phone:.user.phone}}'

echo "== 5. place order (1x classic cheeseburger) =="
FOOD_ID=$(json "$BASE/foods" | jq -r '.foods[] | select(.slug=="classic-cheeseburger") | .id')
ORDER=$(json -X POST "$BASE/orders" -H "Authorization: Bearer $TOKEN" \
  -d "{\"items\":[{\"foodId\":\"$FOOD_ID\",\"quantity\":1}]}")
ORDER_ID=$(echo "$ORDER" | jq -r '.order.id')
PICKUP=$(echo "$ORDER" | jq -r '.order.pickupCode')
echo "order $ORDER_ID placed, pickup code $PICKUP"

echo "== 6. admin login + fulfil =="
ADMIN_OTP=$(json -X POST "$BASE/auth/request-otp" -d "{\"phone\":\"$ADMIN_PHONE\"}" | jq -r '.devCode')
ADMIN_TOKENS=$(json -X POST "$BASE/auth/verify-otp" -d "{\"phone\":\"$ADMIN_PHONE\",\"code\":\"$ADMIN_OTP\"}")
ADMIN_TOKEN=$(echo "$ADMIN_TOKENS" | jq -r '.accessToken')
json -X PATCH "$BASE/admin/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"FULFILLED"}' \
  | jq '{order:{status:.order.status,fulfilledAt:.order.fulfilledAt}}'

echo "== 7. billing run for current month =="
YEAR=$(date +%Y)
MONTH=$(date +%m | sed 's/^0//')
json -X POST "$BASE/admin/billing/run" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"year\":$YEAR,\"month\":$MONTH}" | jq .

echo "== 8. smoke customer sees their invoice =="
json -H "Authorization: Bearer $TOKEN" "$BASE/invoices" \
  | jq '{invoices:[.invoices[] | {period:(.periodYear|tostring)+"-"+(.periodMonth|tostring),status,totalCents}]}'

echo "SMOKE OK"
