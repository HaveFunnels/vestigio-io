-- Wave 22.8 reta-final: pre-expiry warning (D+10) timestamp.
ALTER TABLE "AnonymousLead" ADD COLUMN "preExpirySentAt" TIMESTAMP(3);
CREATE INDEX "AnonymousLead_status_preExpirySentAt_createdAt_idx" ON "AnonymousLead"("status", "preExpirySentAt", "createdAt");
