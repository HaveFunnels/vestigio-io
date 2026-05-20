-- Wave 19b Phase 2: generic LLM result cache.
--
-- Pre-fix four on-demand workspace endpoints (pulse-summary,
-- copy-tone, persona-rewrite, test-recommendations) used module-scoped
-- in-memory Maps as their cache. Every Railway deploy invalidated
-- those caches and customers paid for repeated Haiku calls until the
-- next cycle. The Framework Lens table (Wave 19a) fixed this for one
-- endpoint by typing its rows; the same pattern repeated for these
-- four would be 4× tables for very similar shapes.
--
-- This table is the generic version. Consumers persist arbitrary
-- JSON payloads keyed by (env, cycle, purpose, keyHash, locale). For
-- the four endpoints above the payload is whatever shape they
-- already produce; the cache is just a survival mechanism across
-- deploys.

CREATE TABLE "LlmResultCache" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "payload" JSONB NOT NULL,
    "modelId" TEXT,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LlmResultCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LlmResultCache_envId_cycleId_purpose_keyHash_locale_key"
  ON "LlmResultCache"("environmentId", "cycleId", "purpose", "keyHash", "locale");

CREATE INDEX "LlmResultCache_environmentId_purpose_locale_idx"
  ON "LlmResultCache"("environmentId", "purpose", "locale");

CREATE INDEX "LlmResultCache_cycleId_idx"
  ON "LlmResultCache"("cycleId");

ALTER TABLE "LlmResultCache"
  ADD CONSTRAINT "LlmResultCache_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
