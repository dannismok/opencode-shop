# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: build — install deps, generate Prisma client, compile TS
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
# backend/ is an npm workspace member but also builds standalone from this
# context. If a lockfile is present use `npm ci`, otherwise `npm install`.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
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

COPY package*.json ./
# `prisma` is a runtime dependency so `migrate deploy` works at boot.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /data \
    && chown -R app:app /data /app

USER app
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
