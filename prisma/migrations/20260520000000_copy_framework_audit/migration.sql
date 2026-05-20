-- Wave 19a: persist Copy Framework Lens audit results.
--
-- Before: every API hit to /api/workspace/copy-framework-audit returned
-- from an in-memory Map<string, AuditResult> cache. The cache lived in
-- the route module so EVERY dev restart, Railway deploy, or new server
-- instance had an empty cache. The component fires 10 parallel requests
-- on mount (one per framework), so a cold cache = 10 Haiku calls in
-- parallel = ~10 seconds of "loading" UI on every page open after a
-- deploy. Customer feedback flagged this explicitly: "por que toda vez
-- que abro ou recarrego a página, leva quase 10 segundos para as
-- informações aparecerem?"
--
-- After: results land in CopyFrameworkAudit keyed by
-- (environmentId, cycleId, frameworkId, pageUrl, locale). The API route
-- reads from DB first, falls back to LLM on miss, and writes back the
-- generated result. Subsequent hits inside the same cycle are instant.
--
-- Phase 2 (not in this migration): audit-runner pre-populates every row
-- for the org's locale on COLD cycle completion only. Warm/hot cycles
-- keep their existing rows untouched so we don't burn $/cycle.

CREATE TABLE "CopyFrameworkAudit" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageSlot" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "scorePct" INTEGER NOT NULL,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyFrameworkAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CopyFrameworkAudit_environmentId_cycleId_frameworkId_pageUrl_locale_key"
  ON "CopyFrameworkAudit"("environmentId", "cycleId", "frameworkId", "pageUrl", "locale");

CREATE INDEX "CopyFrameworkAudit_environmentId_locale_idx"
  ON "CopyFrameworkAudit"("environmentId", "locale");

CREATE INDEX "CopyFrameworkAudit_cycleId_idx"
  ON "CopyFrameworkAudit"("cycleId");

ALTER TABLE "CopyFrameworkAudit"
  ADD CONSTRAINT "CopyFrameworkAudit_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
