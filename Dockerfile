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

# ── ProjectDiscovery tools (Nuclei + Katana) ─
# Standalone Go binaries downloaded from official GitHub releases. Pinned
# for reproducibility — bump versions explicitly, not via :latest.
#
# Why a dedicated stage:
# - Decouples cache invalidation (app code changes don't re-download binaries)
# - Parallelizable with deps/builder stages
# - Templates pre-baked at build time so first scan in prod has zero network
#   dependency and runs at full speed
#
# Why amd64 only: Railway runtimes are amd64. If we ever build for arm64
# (e.g. local M-series dev via Docker), add the corresponding asset URLs
# and an ARG TARGETARCH switch. For now the worker invocation path
# (`workers/nuclei/runner.ts`, `workers/katana/runner.ts`) gracefully skips
# if the binary isn't in PATH, so local dev keeps working without these.
FROM debian:bookworm-slim AS tools

ARG NUCLEI_VERSION=3.8.0
ARG KATANA_VERSION=1.6.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/nuclei.zip \
    "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip" \
    && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
    && rm /tmp/nuclei.zip \
    && chmod +x /usr/local/bin/nuclei \
    && /usr/local/bin/nuclei -version

RUN curl -fsSL -o /tmp/katana.zip \
    "https://github.com/projectdiscovery/katana/releases/download/v${KATANA_VERSION}/katana_${KATANA_VERSION}_linux_amd64.zip" \
    && unzip /tmp/katana.zip -d /usr/local/bin/ \
    && rm /tmp/katana.zip \
    && chmod +x /usr/local/bin/katana \
    && /usr/local/bin/katana -version

# Pre-bake Nuclei templates so the first scan in production has zero network
# dependency. Default location is $HOME/.config/nuclei-templates (root in
# this image). The curated checks in packages/nuclei-adapter/curated-checks.ts
# reference template paths under this tree.
RUN /usr/local/bin/nuclei -update-templates -silent

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
#
# `--accept-data-loss` is set because Prisma's warning fires on
# ANY change Prisma considers potentially destructive (adding a unique
# constraint, narrowing a column type, etc.) — even when the actual
# data would NOT be lost (e.g. no duplicate rows for the new unique
# constraint). Without the flag, every such change breaks the deploy
# and forces an out-of-band manual push. Schema changes are reviewed
# in PR before they land, so the trade-off is: trust the PR review +
# unblock CI, accept that a careless "drop column" PR could silently
# delete data. The mitigation is to always review schema PRs with
# `prisma migrate diff` output attached.
ARG DATABASE_URL
ARG BUILD_DATABASE_URL

# Generate Prisma client and build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN if [ -n "$BUILD_DATABASE_URL" ]; then \
      echo "[build] Running prisma db push against BUILD_DATABASE_URL (public proxy)"; \
      DATABASE_URL="$BUILD_DATABASE_URL" DIRECT_URL="$BUILD_DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss; \
    elif [ -n "$DATABASE_URL" ] && ! echo "$DATABASE_URL" | grep -q ".railway.internal"; then \
      echo "[build] Running prisma db push against DATABASE_URL"; \
      DIRECT_URL="$DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss; \
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

# Nuclei + Katana binaries and pre-baked templates from the `tools` stage.
# Both are invoked via execFile by workers/nuclei/runner.ts and
# workers/katana/runner.ts respectively; isNucleiAvailable/isKatanaAvailable
# check PATH at runtime, so missing binaries skip the pass gracefully.
COPY --from=tools /usr/local/bin/nuclei /usr/local/bin/nuclei
COPY --from=tools /usr/local/bin/katana /usr/local/bin/katana
COPY --from=tools /root/.config/nuclei-templates /root/.config/nuclei-templates

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
# Wave 18z post-mortem (corrected): my earlier post-mortem was wrong. The
# 27MB `/app/node_modules/prisma` I observed via SSH was from a stale
# pre-Wave-18u image still serving traffic (deploys had been failing for
# 1h due to the DIRECT_URL build error). `@prisma/client` has `prisma`
# as a *peerDependency*, NOT a regular dependency — verified via
# `npm view @prisma/client dependencies` returning `{}` and
# `peerDependencies` returning `{ prisma: '*' }`. Peer deps are not
# auto-installed, so `npm ci --omit=dev` correctly drops the CLI when
# `prisma` itself is in devDependencies. The ~43MB saving IS real.
#
# Schema reconciliation now relies on the build-time `prisma db push`
# above (BUILD_DATABASE_URL is set on both services; build push runs
# against the public proxy). No boot-time push fallback — the CLI
# genuinely isn't shipped at runtime anymore.
CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = \"worker\" ]; then exec npm run start:worker; else exec node server.js; fi"]
