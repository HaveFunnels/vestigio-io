-- The product's memory.
--
-- A council of nine reviewers was asked to pick between three delivery
-- formats and refused the question. Five of them arrived independently
-- at the same missing thing, and none of the three options contained
-- it: there is no memory. Every edition re-derives everything from a
-- rolling 30-day window, so the product cannot say "sixth week in a
-- row", cannot see a rate that rots 12% a month without any single
-- week looking abnormal, and cannot tell whether last month's
-- recommendation worked.
--
-- Additive and nullable-by-construction: nothing reads this table yet,
-- so the migration cannot change any existing behaviour. It exists to
-- start the clock, because this is the one asset that cannot be bought
-- later. A competitor copies a layout in a weekend and a judgment in a
-- prompt; nobody copies six months of series that began in May.
--
-- Cost, measured on the instrumented account rather than estimated:
-- 63 rows per day across campaign, page and term, which is ~25k rows
-- and ~5 MB per environment over the 400-day retention, against the
-- ~670k raw sessions the same year produces.

CREATE TABLE "TrafficDailyRollup" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    -- campaign | page | term | account. One table rather than three:
    -- every consumer asks the same question of all of them.
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    -- The campaign name as the operator wrote it, so a series survives
    -- the campaign being renamed.
    "label" TEXT,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "blind" INTEGER NOT NULL DEFAULT 0,
    "action" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "contacts" INTEGER NOT NULL DEFAULT 0,
    -- Which definition of "did nothing" produced `blind`. Stored from
    -- the first row because it is impossible to reconstruct later: the
    -- headline already moved from 70.1% to 29.5% once, with the verdict
    -- inverting from pause to do-not-pause on the same account, and
    -- nothing recorded that the ruler had changed. A delta only means
    -- something if both sides were measured the same way.
    "rulerVersion" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficDailyRollup_pkey" PRIMARY KEY ("id")
);

-- The upsert key. A day still open is recomputed on each pass and
-- settles once it is past.
CREATE UNIQUE INDEX "TrafficDailyRollup_envId_day_dimension_key_key"
    ON "TrafficDailyRollup"("envId", "day", "dimension", "key");

-- The read path: one dimension, one environment, a date range.
CREATE INDEX "TrafficDailyRollup_envId_dimension_day_idx"
    ON "TrafficDailyRollup"("envId", "dimension", "day");

ALTER TABLE "TrafficDailyRollup"
    ADD CONSTRAINT "TrafficDailyRollup_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
