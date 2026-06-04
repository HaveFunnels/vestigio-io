-- Wave-22.6 review fix P2.3 — per-org cap on manual seed URLs.
-- Default 200 covers SMB; platform admin bumps for enterprise.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "manualSeedCap" INTEGER NOT NULL DEFAULT 200;
