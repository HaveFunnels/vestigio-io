-- Wave 22.6 Step 6 — partial regen counter.
-- Tracks how many event-driven partial regenerations have fired for
-- a (env, month) plan. Capped at 4 by the application (renarrate.ts)
-- to bound monthly LLM cost. Existing plans start at 0 — accurate
-- since none have fired yet.

ALTER TABLE "MonthlyStrategyPlan"
  ADD COLUMN "regenCount" INTEGER NOT NULL DEFAULT 0;
