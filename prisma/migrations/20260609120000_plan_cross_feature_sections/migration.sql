-- Wave 22.8 — cross-feature plan sections
-- Copy Lens, Competitor Radar, Brand Impersonators, Maps
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "copyLensJson" JSONB;
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "competitorJson" JSONB;
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "impersonatorsJson" JSONB;
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "mapsJson" JSONB;
