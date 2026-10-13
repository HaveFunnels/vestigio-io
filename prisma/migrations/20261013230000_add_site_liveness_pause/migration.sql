-- Dead-site detection (apps/probe-runner/site-liveness.ts).
--
-- pausedReason records WHY Environment.continuousPaused is set so the
-- resume path and admin surfaces can distinguish an inactive customer
-- from a site that no longer exists:
--   NULL         -> not paused (or paused before this column existed)
--   'inactivity' -> >14d without an owner/member loading /app/*
--   'site_dead'  -> landing URL failed every probe for a full week
--
-- siteDeadSinceAt is the first failure of the streak that tripped the
-- pause, so the UI can report "gone since" rather than just "paused".
--
-- No new index needed: the liveness window query is served by the
-- existing PageProbe (environmentId, url, observedAt DESC) index.
ALTER TABLE "Environment" ADD COLUMN "pausedReason" TEXT;
ALTER TABLE "Environment" ADD COLUMN "siteDeadSinceAt" TIMESTAMP(3);

-- Backfill: every currently-paused env predates this feature and was
-- paused by the inactivity cron, which was the only writer until now.
UPDATE "Environment" SET "pausedReason" = 'inactivity' WHERE "continuousPaused" = true;
