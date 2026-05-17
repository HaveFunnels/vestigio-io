-- Wave 18z: heartbeat-on-claim model for AuditCycle orphan re-dispatch.
--
-- Before: healStuckCycles + redispatchOrphanedPending compared
-- createdAt against a cutoff (25min / 15min). The race window: a slow
-- worker about to claim a pending cycle while the heal cron concurrently
-- re-dispatches it — produces a double-run.
--
-- After: the worker writes lastHeartbeatAt every WORKER_HEARTBEAT_MS
-- (default 30s) while the cycle is running. The heal cron uses
-- heartbeat freshness (default 3min stale) instead of createdAt to
-- decide if a cycle is truly orphaned. A worker that lost its DB
-- connection mid-cycle gets re-dispatched within 3min instead of 25min,
-- and a worker that's actively heartbeating is never re-dispatched.
--
-- Backward compat: rows existing before this column was added have
-- lastHeartbeatAt = NULL. The heal predicate is:
--   (lastHeartbeatAt IS NULL AND createdAt < legacy_cutoff)
--     OR lastHeartbeatAt < heartbeat_cutoff
-- so legacy in-flight rows stay governed by the createdAt cutoff.

ALTER TABLE "AuditCycle"
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

-- Composite index for the heartbeat-staleness scan in healStuckCycles.
-- Mirrors the existing (status, createdAt) compound for the legacy path.
CREATE INDEX "AuditCycle_status_lastHeartbeatAt_idx"
  ON "AuditCycle" ("status", "lastHeartbeatAt");
