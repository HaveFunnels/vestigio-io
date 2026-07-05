-- Wave 18e P3.1 — audit-log tamper-evidence chain.
-- Each new row stores SHA-256 hash of its canonical payload plus the
-- previous row's hash, so retroactive edits are detectable.
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;
