-- Wave 22.8 #10 Move 2 — followup email 24h tracking + index
ALTER TABLE "AnonymousLead" ADD COLUMN "followupSentAt" TIMESTAMP(3);
CREATE INDEX "AnonymousLead_status_followupSentAt_createdAt_idx" ON "AnonymousLead"("status", "followupSentAt", "createdAt");
