-- Phase 2 — persist finding-level lineage on every PlanNextStep so
-- the Plano → Findings drill-down can filter to exactly the findings
-- that drove the ranking, instead of inferring them at request time
-- via the linkedActionRefs → Action.findingId chain (slower; can
-- drift when actions are deleted; misses findings that were
-- "considered but not actioned" by the planner).
--
-- Default '[]' so the column is backfilled without writing per-row
-- backfills. Existing plans expose an empty array; the read-side
-- (API) keeps a runtime fallback to the action-derived lineage so
-- pre-Phase-2 plans don't break.
ALTER TABLE "PlanNextStep"
  ADD COLUMN IF NOT EXISTS "linkedFindingRefsJson" JSONB NOT NULL DEFAULT '[]'::jsonb;
