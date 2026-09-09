-- First user agent per session, so readers migrating off raw events keep
-- UA-based device classification (mobile vs desktop). Nullable; old
-- aggregates fall back to the behavioral mobile heuristic.
ALTER TABLE "BehavioralSessionAggregate" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
