-- Wave 22.6 — first-class dedup tag on NotificationLog.
-- Older event triggers (incident, regression, page_down) match on a
-- subject-substring derived from the tag, which silently fails for
-- events whose subject doesn't carry a deterministic identifier
-- (strategy_plan_ready being the surfacing case). Adding a direct
-- column + index makes dedup reliable for any event going forward.

ALTER TABLE "NotificationLog" ADD COLUMN "tag" TEXT;
CREATE INDEX "NotificationLog_tag_createdAt_idx" ON "NotificationLog" ("tag", "createdAt");
