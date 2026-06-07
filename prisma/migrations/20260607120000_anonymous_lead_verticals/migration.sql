-- Wave-22.7 — vertical extension (services, app-conversion, enterprise).
-- Adds nullable sub-segmentation + value-per-customer columns to
-- AnonymousLead so the audit runner + result page can render
-- vertical-specific findings + impact ranges. All columns nullable
-- so legacy leads + other-vertical flows stay intact.
ALTER TABLE "AnonymousLead"
  ADD COLUMN IF NOT EXISTS "serviceCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "avgClientLTV" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "relationshipMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "appPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "appInstallLTV" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "enterpriseSegment" TEXT,
  ADD COLUMN IF NOT EXISTS "avgAcvBrl" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "salesCycleMonths" INTEGER;
