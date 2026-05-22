-- Wave 20.4 — Finding lifecycle (Modelo B)
-- Per ENGINE_TARGET_API.md §6: lifecycle moves from Decision-as-status
-- onto Finding. Powers Wave 21.5 "value caught" monthly report by
-- making it a simple WHERE status='resolved' query.

ALTER TABLE "Finding" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'created';
ALTER TABLE "Finding" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Finding" ADD COLUMN "cyclesSeen" INTEGER NOT NULL DEFAULT 1;

-- Cross-cycle lifecycle matching: (env, inferenceKey, surface) is the
-- finding "instance" identity across cycles. cycleRef changes per
-- cycle so it's not part of identity.
CREATE INDEX "Finding_environmentId_inferenceKey_surface_idx"
  ON "Finding"("environmentId", "inferenceKey", "surface");

-- Value-caught query: "all findings that became resolved in this
-- window" needs (env, status, statusChangedAt) for efficient range
-- scans on the dashboard / report layer.
CREATE INDEX "Finding_environmentId_status_statusChangedAt_idx"
  ON "Finding"("environmentId", "status", "statusChangedAt");
