-- PV.0 — perception layer (multi-vertical coverage track).
-- Autonomously-perceived business vertical per environment, written by the
-- perception pass (PV.2). Nullable; nothing reads these columns yet
-- (resolveEffectiveVertical falls back to onboarding while null).
ALTER TABLE "Environment" ADD COLUMN "perceivedVertical" TEXT;
ALTER TABLE "Environment" ADD COLUMN "perceivedVerticalConfidence" DOUBLE PRECISION;
ALTER TABLE "Environment" ADD COLUMN "perceivedVerticalUpdatedAt" TIMESTAMP(3);
