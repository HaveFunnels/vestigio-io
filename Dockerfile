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

# Generate Prisma client and build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
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
# Prisma CLI (devDep, not in deps stage). Needed at runtime for the
# auto-migrate step in the web CMD (`prisma db push`). Without this,
# `npx prisma` would fetch the latest CLI from npm on each boot and
# pull breaking-change versions (Prisma 7 dropped schema `url`).
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
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
# Web service runs `prisma db push` on boot so Prisma schema changes
# land without a separate migration step (fixes drift like wave-5
# `Environment.activated` that previously required manual intervention).
# `db push` is idempotent — a no-op when schema already matches, so
# replica races are safe. Without `--accept-data-loss`, destructive
# changes (dropped cols) fail the start and Railway rolls back; this
# is the intended safety net.
# `exec` ensures the child process becomes PID 1 so SIGTERM from Railway
# reaches Next.js / worker directly for graceful drain.
CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = \"worker\" ]; then exec npm run start:worker; else node node_modules/prisma/build/index.js db push && exec node server.js; fi"]
