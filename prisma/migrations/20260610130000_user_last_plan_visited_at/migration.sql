-- Wave 22.8 reta-final: stalling detection.
-- Updated on every Plan page open; cheap signal for re-engagement
-- and at-risk customer reporting.
ALTER TABLE "User" ADD COLUMN "lastPlanVisitedAt" TIMESTAMP(3);
