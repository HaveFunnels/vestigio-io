-- Measured-behavior section for the strategy plan. The pixel's own
-- numbers (traffic origin, dwell, scroll, no-intent alerts) never
-- reached the customer-facing plan — the casamontelle cross-exam's
-- closing point was precisely that the TikTok alert lived in an
-- internal calibration doc while the paid PDF ran on crawl heuristics.
ALTER TABLE "MonthlyStrategyPlan" ADD COLUMN IF NOT EXISTS "behavioralJson" JSONB;
