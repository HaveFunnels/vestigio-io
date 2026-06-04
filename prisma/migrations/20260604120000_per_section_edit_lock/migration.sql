-- Wave 22.6 follow-up — replace plan-wide editLockedByMcpUntil with
-- a per-section JSON map. Plan-wide column trapped all sections
-- behind a single pending edit; per-section unblocks parallel
-- proposals across narrative + value-preview + next-step rows.
--
-- Idempotent: DROP IF EXISTS handles envs where the original
-- editLockedByMcpUntil column never landed (some prod envs migrated
-- via prisma db push and skipped that migration). ADD COLUMN IF
-- NOT EXISTS keeps re-runs safe.

ALTER TABLE "MonthlyStrategyPlan" DROP COLUMN IF EXISTS "editLockedByMcpUntil";
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN IF NOT EXISTS "editLockedSectionsByMcp" JSONB;
