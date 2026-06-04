-- Wave 22.6 follow-up — replace plan-wide editLockedByMcpUntil with
-- a per-section JSON map. Plan-wide column trapped all sections
-- behind a single pending edit; per-section unblocks parallel
-- proposals across narrative + value-preview + next-step rows.
--
-- Safe to drop: existing values had a 10-min TTL and there are no
-- prod plans with active locks. New rows write to the JSON column.

ALTER TABLE "MonthlyStrategyPlan" DROP COLUMN "editLockedByMcpUntil";
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN "editLockedSectionsByMcp" JSONB;
