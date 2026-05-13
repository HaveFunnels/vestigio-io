-- Orphan tracking for PageInventoryItem. lastSeenCycleId is set every
-- successful fetch; removedAt is set when a page disappears for > 14d.
ALTER TABLE "PageInventoryItem"
ADD COLUMN "lastSeenCycleId" TEXT,
ADD COLUMN "removedAt" TIMESTAMP(3);

CREATE INDEX "PageInventoryItem_environmentRef_removedAt_idx"
ON "PageInventoryItem"("environmentRef", "removedAt");
