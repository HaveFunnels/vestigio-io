-- Wave-22.6 — ProductEvent now accepts anonymous funnel events.
-- userId/orgId become nullable; new leadId column for LP audit trail.
-- The same table holds both anon (leadId set) and authenticated
-- (userId/orgId set) events so the admin platform can query them
-- uniformly.

ALTER TABLE "ProductEvent"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "orgId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "leadId" TEXT;

-- Compound index for "show me all events for this lead, by recency"
-- queries from the admin dashboards. Existing indexes left intact.
CREATE INDEX IF NOT EXISTS "ProductEvent_leadId_event_createdAt_idx"
  ON "ProductEvent" ("leadId", "event", "createdAt");
