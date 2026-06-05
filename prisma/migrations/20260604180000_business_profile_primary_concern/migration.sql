-- Wave-22.6 onboarding redesign — JTBD discovery columns. All
-- nullable so legacy rows aren't broken.
--   primaryConcern: what's bothering the buyer most.
--   currentOptimizationMethod: how they figure out what to optimize
--                              today without Vestigio (competitive ctx).
--   whyNow: the triggering event that brought them in (urgency).
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "primaryConcern" TEXT,
  ADD COLUMN IF NOT EXISTS "currentOptimizationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "whyNow" TEXT;
