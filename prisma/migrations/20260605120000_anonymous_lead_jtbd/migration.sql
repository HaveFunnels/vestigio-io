-- Wave-22.6 mini-audit redesign — JTBD discovery embedded in the
-- LP audit form. Same column names as BusinessProfile so the
-- localStorage handoff into paid onboarding doesn't need translation.
ALTER TABLE "AnonymousLead"
  ADD COLUMN IF NOT EXISTS "primaryConcern" TEXT,
  ADD COLUMN IF NOT EXISTS "currentOptimizationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "whyNow" TEXT;
