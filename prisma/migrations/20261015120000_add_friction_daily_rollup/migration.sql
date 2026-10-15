-- Pre-computed friction counts per environment / page / day.
--
-- measured-friction.ts derived these by scanning raw
-- BehavioralSessionAggregate.timeline over a rolling 30-day window on
-- every plan generation. That scan is the only long-window reader of
-- raw timelines, and timelines are 83% of the database footprint, so
-- it is the single thing keeping timeline retention at 90 days.
--
-- A session belongs to exactly one day via startedAt, so daily buckets
-- sum correctly across any window -- including the distinct-session
-- counts.
CREATE TABLE "FrictionDailyRollup" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "sessionsWithFriction" INTEGER NOT NULL DEFAULT 0,
    "deadClicks" INTEGER NOT NULL DEFAULT 0,
    "hesitationsNearCta" INTEGER NOT NULL DEFAULT 0,
    "inputAbandons" INTEGER NOT NULL DEFAULT 0,
    "backtracks" INTEGER NOT NULL DEFAULT 0,
    "formRetries" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FrictionDailyRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FrictionDailyRollup_envId_day_path_key"
    ON "FrictionDailyRollup"("envId", "day", "path");
CREATE INDEX "FrictionDailyRollup_envId_day_idx"
    ON "FrictionDailyRollup"("envId", "day");

ALTER TABLE "FrictionDailyRollup" ADD CONSTRAINT "FrictionDailyRollup_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
