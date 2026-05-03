-- Add readAt to NotificationLog for independent read tracking
-- (separates delivery status from bell read state)
ALTER TABLE "NotificationLog" ADD COLUMN "readAt" TIMESTAMP(3);

-- Index for efficient unread-count queries in the bell
CREATE INDEX "NotificationLog_userId_readAt_idx" ON "NotificationLog"("userId", "readAt");

-- Add new preference toggles for verified_resolved and digest events
ALTER TABLE "NotificationPreference" ADD COLUMN "alertOnVerifiedResolved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "alertOnDigest" BOOLEAN NOT NULL DEFAULT true;
