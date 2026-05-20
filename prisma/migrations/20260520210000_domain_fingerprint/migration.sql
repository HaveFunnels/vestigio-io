-- Wave 19c: per-environment "identity" snapshot. Populated on the
-- first cold cycle, refreshed at most quarterly. Chat agent reads
-- the LLM-derived industry on every turn so it doesn't have to
-- re-infer from the domain name.

CREATE TABLE "DomainFingerprint" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "detectedPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryLocale" TEXT,
    "aiBotPolicy" JSONB,
    "industry" TEXT,
    "industryConfidence" INTEGER,
    "industryClassifiedAt" TIMESTAMP(3),
    "firstAuditAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainFingerprint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainFingerprint_environmentId_key"
  ON "DomainFingerprint"("environmentId");

ALTER TABLE "DomainFingerprint" ADD CONSTRAINT "DomainFingerprint_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
