-- Wave 19b: TokenCostLedger.userId now nullable.
--
-- Pre-Wave 19b only the chat pipeline wrote ledger entries — every
-- chat call had a userId because it ran inside a NextAuth request.
-- Wave 19b plumbs every LLM call site (cycle-time enrichments,
-- audit-runner framework-lens, etc.) through the same ledger. Those
-- callers don't have a user — they belong to an org, not a user.
-- Relaxing the column avoids forcing a fake placeholder ID.

ALTER TABLE "TokenCostLedger" ALTER COLUMN "userId" DROP NOT NULL;
