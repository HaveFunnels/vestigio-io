-- Wave-23 value-on-fill: early-crawl progress snapshot on AnonymousLead.
-- Persisted as JSONB. Shape lives in src/types/crawl-progress.ts.
-- Nullable + backwards-compatible (existing leads stay valid with NULL).
ALTER TABLE "AnonymousLead" ADD COLUMN "crawlProgress" JSONB;
