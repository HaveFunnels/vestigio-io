-- Add user-configurable crawl exclusion patterns to Environment.
-- Applied at discovery + per-URL crawl gate during audit cycles.
ALTER TABLE "Environment"
ADD COLUMN "crawlExcludePatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
