-- Wave 19c: cross-cycle cache for LLM-derived page-content enrichments.
-- Keys on a content fingerprint (sha256 of normalized prompt input)
-- so when the next cold cycle hits the same page with unchanged copy,
-- we reuse the Haiku assessment from last week instead of paying again.

CREATE TABLE "ContentEnrichmentCache" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "pageUrl" TEXT,
    "payload" JSONB NOT NULL,
    "modelId" TEXT,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentEnrichmentCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentEnrichmentCache_environmentId_purpose_contentHash_locale_key"
  ON "ContentEnrichmentCache"("environmentId", "purpose", "contentHash", "locale");

CREATE INDEX "ContentEnrichmentCache_environmentId_purpose_idx"
  ON "ContentEnrichmentCache"("environmentId", "purpose");

CREATE INDEX "ContentEnrichmentCache_lastHitAt_idx"
  ON "ContentEnrichmentCache"("lastHitAt");

ALTER TABLE "ContentEnrichmentCache" ADD CONSTRAINT "ContentEnrichmentCache_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
