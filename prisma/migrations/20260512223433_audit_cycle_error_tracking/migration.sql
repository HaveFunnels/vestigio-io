-- Partial-failure visibility for AuditCycle. lastError captures the
-- step name + error message when a transactional write step throws;
-- retryCount lets the heal cron stop after N retries instead of looping.
ALTER TABLE "AuditCycle"
ADD COLUMN "lastError" TEXT,
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
