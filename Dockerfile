# ──────────────────────────────────────────────
# Vestigio.io — Production Dockerfile
#
# Next.js app + audit-runner worker with
# Playwright/Chromium for authenticated SaaS
# verification workers. A single image serves
# both roles; SERVICE_ROLE env var at runtime
# selects the process (web vs worker).
# ──────────────────────────────────────────────

FROM node:20-slim AS base

# Install system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libx11-6 \
    libxfixes3 \
    fonts-liberation \
    libgl1 \
    libmagic1 \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dependencies ─────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --omit=dev --legacy-peer-deps
# Install Playwright Chromium (cached in this layer)
RUN npx playwright install chromium

# ── Builder ──────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY . .

# Wave 18z — schema push moved from boot CMD to build phase so the runtime
# image no longer needs the ~43MB `prisma` CLI npm package.
#
# Two ARGs in play:
#   - DATABASE_URL: the service's runtime URL (Railway auto-passes to ARG of
#     same name). On Railway this points to *.railway.internal hosts which
#     are NOT resolvable from the build sandbox. So we can't push against it.
#   - BUILD_DATABASE_URL: the operator-set build-time URL using Postgres's
#     PUBLIC proxy (Railway exposes it on the Postgres service as
#     `DATABASE_PUBLIC_URL`, e.g. `interchange.proxy.rlwy.net:26390`).
#     This DOES resolve at build time.
#
# The push runs when BUILD_DATABASE_URL is set; otherwise skipped (local
# docker-build with no DB access still succeeds, and the operator can run
# `prisma db push` once manually if they ever skip the build-time path).
# `db push --skip-generate` is idempotent (no-op when schema matches), so
# re-running on every image build is safe.
ARG DATABASE_URL
ARG BUILD_DATABASE_URL

# Generate Prisma client and build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN if [ -n "$BUILD_DATABASE_URL" ]; then \
      echo "[build] Running prisma db push against BUILD_DATABASE_URL (public proxy)"; \
      DATABASE_URL="$BUILD_DATABASE_URL" npx prisma db push --skip-generate; \
    elif [ -n "$DATABASE_URL" ] && ! echo "$DATABASE_URL" | grep -q ".railway.internal"; then \
      echo "[build] Running prisma db push against DATABASE_URL"; \
      npx prisma db push --skip-generate; \
    else \
      echo "[build] No build-reachable DB URL set — skipping prisma db push (operator must reconcile schema manually if migration is required)"; \
    fi
RUN npm run build

# ── Runner ───────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Overlay full production node_modules over Next.js standalone's minimal set.
# Reason: standalone mode only bundles what Next.js statically analyzes as
# needed. The audit worker runs `tsx apps/audit-runner/worker-loop.ts` at
# runtime — tsx + ioredis + the rest of `dependencies` must be present.
# Using --from=deps (prod-only install) keeps image tight (no devDeps).
# Web service continues to work: standalone's node_modules is a subset
# of deps's node_modules, so the superset satisfies Next.js too.
COPY --from=deps /app/node_modules ./node_modules

# Generated Prisma client sits in the builder (runs `prisma generate`);
# copy AFTER the deps overlay so the generated .prisma + @prisma versions
# win (deps stage only has the unpopulated client package).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Wave 18z — Prisma CLI dropped from the runtime image (~43MB saved). Schema
# reconciliation moved to the builder stage (`prisma db push` runs there when
# DATABASE_URL build arg is set). The Prisma client (@prisma/client + .prisma)
# still ships at runtime — only the standalone CLI package is gone.
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Worker source files — imported at runtime by tsx.
# `src/` is needed because worker-loop.ts has imports like
# `import { prisma } from "../../src/libs/prismaDb"` that tsx resolves
# against the raw on-disk source. Web service doesn't need src/ at
# runtime (Next.js standalone pre-compiles everything into server.js)
# but including it here is cheap (~MB) and keeps one image for both.
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Root-level config files imported via ../../ from src/ (i18n, engine translations).
COPY --from=builder /app/integrations.config.tsx ./integrations.config.tsx
COPY --from=builder /app/dictionary ./dictionary

# Worker loop health server (overridable via WORKER_HEALTH_PORT env).
EXPOSE 3000 3001

# Unified entry point:
#   SERVICE_ROLE=worker  →  audit-runner worker loop (queue consumer).
#   anything else (including unset)  →  Next.js standalone server.
# Wave 18z — schema reconciliation moved from boot to the Docker builder
# stage (see ARG DATABASE_URL above). The runtime no longer carries the
# Prisma CLI, so this CMD is a pure `node server.js` for the web role.
# `exec` ensures the child process becomes PID 1 so SIGTERM from Railway
# reaches Next.js / worker directly for graceful drain.
# Wave 18z post-mortem: Wave 18u's "drop Prisma CLI for ~43MB savings" was
# misled — `@prisma/client` (in dependencies) has `prisma` as a transitive
# dependency, so `npm ci --omit=dev` installs prisma at the deps stage
# regardless of its devDependencies classification. Verified via runtime
# `ls /app/node_modules/prisma` showing the 27MB CLI present. Since the
# CLI is at runtime anyway, restoring the boot-time `prisma db push` as a
# belt-and-suspenders fallback to the build-time push: if BUILD_DATABASE_URL
# was set and the build push succeeded, this boot-time push is an
# idempotent no-op; if the build push was skipped (BUILD_DATABASE_URL
# unset, local docker build, etc.), this catches the schema drift.
CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = \"worker\" ]; then exec npm run start:worker; else node node_modules/prisma/build/index.js db push && exec node server.js; fi"]
