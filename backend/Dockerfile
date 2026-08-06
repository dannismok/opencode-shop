# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: build — install deps, generate Prisma client, compile TS
# Build from the repo root so COPY paths are repo-relative:
#   docker build -f backend/Dockerfile .
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app
# No NODE_ENV here: npm must install devDependencies (typescript) for `npm run build`.
# If a lockfile is present use `npm ci`, otherwise `npm install`.
COPY backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# ============================================================
# Stage 2: runtime — prod deps only, non-root user, /data volume
# ============================================================
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    LOG_LEVEL=info \
    DATABASE_URL=file:/data/app.db \
    UPLOAD_DIR=/data/uploads \
    BILLING_CRON_ENABLED=false

COPY backend/package*.json ./
# `prisma` is a runtime dependency so `migrate deploy` works at boot.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /data \
    && chown -R app:app /data /app

USER app
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
