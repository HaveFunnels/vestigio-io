-- Sessions, not events, become the unit that is retained.
--
-- RawBehavioralEvent was measured at 61,099 rows/day for one
-- environment (~85 MB/day), which at the 90-day product window implied
-- 7.6 GB for a single customer against a 4.6 GB volume. The same window
-- costs ~585 MB here, because 61,099 events collapse into 4,353
-- sessions and the per-event duplication (URL, userAgent, envelope
-- fields repeated on every row) collapses with them.
--
-- Additive only: nothing is dropped here. The raw table keeps its
-- current behaviour until the readers are migrated, so this migration
-- is safe to apply ahead of the code that fills the table.

CREATE TABLE IF NOT EXISTS "BehavioralSessionAggregate" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "aggregate" TEXT NOT NULL,
    "timeline" TEXT NOT NULL,
    "urls" TEXT NOT NULL,
    "timelineTruncated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BehavioralSessionAggregate_pkey" PRIMARY KEY ("id")
);

-- The upsert key. One row per session per environment.
CREATE UNIQUE INDEX IF NOT EXISTS "BehavioralSessionAggregate_envId_sessionId_key"
    ON "BehavioralSessionAggregate"("envId", "sessionId");

-- startedAt drives the product queries (journey map ranges, monthly
-- journeys); receivedAt drives retention, on the server clock, so a
-- skewed client cannot keep a row alive past its window.
CREATE INDEX IF NOT EXISTS "BehavioralSessionAggregate_envId_startedAt_idx"
    ON "BehavioralSessionAggregate"("envId", "startedAt");
CREATE INDEX IF NOT EXISTS "BehavioralSessionAggregate_envId_receivedAt_idx"
    ON "BehavioralSessionAggregate"("envId", "receivedAt");

ALTER TABLE "BehavioralSessionAggregate"
    ADD CONSTRAINT "BehavioralSessionAggregate_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index the FK child column. Prisma does not do this on its own, and an
-- unindexed cascade child is what made AuditCycle deletion take hours
-- instead of seconds during the Sept 2026 incident.
CREATE INDEX IF NOT EXISTS "BehavioralSessionAggregate_envId_idx"
    ON "BehavioralSessionAggregate"("envId");
