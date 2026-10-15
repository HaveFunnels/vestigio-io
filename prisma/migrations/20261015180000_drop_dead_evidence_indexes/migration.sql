-- Two indexes on Evidence that cost write time and 18 MB and buy
-- nothing. Measured 2026-10-15 against production, with
-- pg_stat_database.stats_reset null, so the scan counters cover the
-- whole life of the database rather than a recent window.
--
-- Evidence_cycleRef_idx (10 MB, 93 scans): a strict prefix of
-- Evidence_cycleRef_evidenceKey_key, which Postgres uses for
-- cycleRef-only lookups just as well.
--
-- Evidence_subjectRef_idx (7.6 MB, 0 scans): never used, not once.
-- Lookups that filter on subjectRef go through
-- Evidence_environmentRef_subjectRef_evidenceType_idx.
DROP INDEX IF EXISTS "Evidence_cycleRef_idx";
DROP INDEX IF EXISTS "Evidence_subjectRef_idx";
