-- Wave 21.2 — Probe scheduler: lightweight critical-page diff watcher.
--
-- A probe is a single fetch of one URL with a content hash, persisted
-- so the next probe can compare hashes and detect material change
-- without paying the cost of a full audit cycle. When the hash
-- differs, the probe runner enqueues a targeted audit cycle that
-- re-fetches + re-enriches only the affected URL via engine.run({
-- scope: { kind: 'targeted', url } }).
--
-- Indexes:
--   (environmentId, url, observedAt DESC) — latest probe per (env, url)
--     for diff comparison, the hot path on every probe pass.
--   (environmentId, observedAt) — pruning + admin dashboards.

CREATE TABLE "PageProbe" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "contentLength" INTEGER NOT NULL,
    "fetchMs" INTEGER NOT NULL,
    -- Whether THIS probe's contentHash differs from the prior probe's
    -- hash for the same (env, url). Null on the very first probe for
    -- that pair. Lets the cron grep for `changedFromPrior=true AND
    -- observedAt > X` to find recent material changes.
    "changedFromPrior" BOOLEAN,
    -- Prior hash captured for explainability ("yesterday this hashed
    -- to X, today it hashes to Y"). Null on first probe.
    "priorHash" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageProbe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageProbe_environmentId_url_observedAt_idx"
    ON "PageProbe"("environmentId", "url", "observedAt" DESC);
CREATE INDEX "PageProbe_environmentId_observedAt_idx"
    ON "PageProbe"("environmentId", "observedAt");

ALTER TABLE "PageProbe" ADD CONSTRAINT "PageProbe_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditCycle.scopeJson: JSON blob describing a targeted re-analysis.
-- Null for normal full cycles (cycleType IN ('hot','warm','cold','full')).
-- When set, cycleType='targeted' and the run-cycle code reads scopeJson
-- to pass through to engine.run({ scope: { kind: 'targeted', url, enrichers } }).
ALTER TABLE "AuditCycle" ADD COLUMN "scopeJson" JSONB;

-- Environment-level probe configuration. probeEnabled is a kill switch
-- per env so we can disable noisy customers without ripping the cron
-- out for everyone. probeUrlsJson is an explicit allow-list of URLs to
-- probe; when null, the probe runner falls back to a heuristic
-- (landingUrl + auto-discovered commercial URLs from latest cycle).
ALTER TABLE "Environment" ADD COLUMN "probeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Environment" ADD COLUMN "probeUrlsJson" JSONB;
ALTER TABLE "Environment" ADD COLUMN "probeLastRunAt" TIMESTAMP(3);
