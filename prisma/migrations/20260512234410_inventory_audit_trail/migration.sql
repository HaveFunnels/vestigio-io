-- Per-URL audit trail (Wave 9.3). Tracks where each URL was first
-- surfaced from and, when we discovered but didn't persist a fetched
-- result, why we skipped it.
ALTER TABLE "PageInventoryItem"
ADD COLUMN "discoverySource" TEXT,
ADD COLUMN "skipReason" TEXT;
