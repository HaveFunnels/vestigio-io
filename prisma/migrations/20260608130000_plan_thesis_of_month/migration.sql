-- E1 — single-sentence monthly thesis at the top of each plan.
-- E3 — continuity payload referencing the prior month's plan.
-- E4 — cross-customer peer pattern callout payload.
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "thesisOfMonth" TEXT;
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "continuityJson" JSONB;
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "crossCustomerPatternJson" JSONB;
