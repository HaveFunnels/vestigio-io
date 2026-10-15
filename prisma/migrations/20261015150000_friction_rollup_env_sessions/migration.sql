-- The plan reports how many sessions the counts are based on. Summing
-- the per-path "sessions" column would double-count any session that
-- touched two pages, so the day's environment-wide total is stored
-- alongside, repeated on each of that day's rows.
--
-- Repeated rather than kept in a sentinel row: a sentinel path would
-- be invisible to the unique index's intent and a reader that forgot
-- to filter it would rank it as the environment's worst page.
ALTER TABLE "FrictionDailyRollup" ADD COLUMN "envSessions" INTEGER NOT NULL DEFAULT 0;
