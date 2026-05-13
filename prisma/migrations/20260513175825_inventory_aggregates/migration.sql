-- Wave 15.3: denormalized aggregate columns on PageInventoryItem
--
-- Eliminates 3 per-request groupBy/scan queries in /api/inventory that
-- were degrading as Evidence + Finding + RawBehavioralEvent grew:
--   1) Evidence findMany(http_response) → lastResponseTimeMs
--   2) Finding groupBy(surface)         → findingCount
--   3) RawBehavioralEvent GROUP BY url  → sessionCount30d
--
-- All three are now point-reads from the inventory row itself. Writes
-- happen at the natural ingestion moment (see code paths in:
--   apps/audit-runner/run-cycle.ts (response_time + finding_count)
--   apps/cron/* (session_count via aggregation worker)
-- ).
--
-- aggregatesUpdatedAt is null for rows whose aggregates haven't been
-- backfilled yet — the API falls back to 0 when null, which keeps
-- existing rows working until the next cycle writes fresh values.

ALTER TABLE "PageInventoryItem"
  ADD COLUMN "lastResponseTimeMs" INTEGER,
  ADD COLUMN "findingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sessionCount30d" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aggregatesUpdatedAt" TIMESTAMP(3);
