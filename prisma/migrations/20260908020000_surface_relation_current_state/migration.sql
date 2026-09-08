-- SurfaceRelation: append-per-cycle -> current state.
--
-- The table had no unique constraint, so the writer's
-- createMany({ skipDuplicates: true }) deduped nothing and every audit
-- cycle re-inserted the entire link graph. Measured on production:
-- 1,078,647 rows / 698 MB for ~416 distinct edges of one website.
--
-- Order matters: collapse duplicates BEFORE adding the unique index,
-- otherwise the index creation fails on existing data.

-- 1. New columns. edgeKey is nullable at first so we can backfill.
ALTER TABLE "SurfaceRelation" ADD COLUMN IF NOT EXISTS "edgeKey" TEXT;
ALTER TABLE "SurfaceRelation" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SurfaceRelation" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Backfill edgeKey. pgcrypto ships with Railway's image; fall back to
--    md5 (also 128-bit, fine for a dedupe key) if it is unavailable.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    UPDATE "SurfaceRelation"
    SET "edgeKey" = encode(digest("sourceUrl" || '|' || "targetUrl" || '|' || "relationType", 'sha256'), 'hex')
    WHERE "edgeKey" IS NULL;
  EXCEPTION WHEN OTHERS THEN
    UPDATE "SurfaceRelation"
    SET "edgeKey" = md5("sourceUrl" || '|' || "targetUrl" || '|' || "relationType")
    WHERE "edgeKey" IS NULL;
  END;
END $$;

-- 3. Collapse duplicates, keeping the newest row per (websiteRef, edgeKey)
--    and folding the discarded rows' history into firstSeenAt/lastSeenAt.
WITH ranked AS (
  SELECT id, "websiteRef", "edgeKey", "createdAt",
         ROW_NUMBER() OVER (PARTITION BY "websiteRef", "edgeKey" ORDER BY "createdAt" DESC) AS rn,
         MIN("createdAt") OVER (PARTITION BY "websiteRef", "edgeKey") AS first_seen,
         MAX("createdAt") OVER (PARTITION BY "websiteRef", "edgeKey") AS last_seen
  FROM "SurfaceRelation"
)
UPDATE "SurfaceRelation" sr
SET "firstSeenAt" = r.first_seen, "lastSeenAt" = r.last_seen
FROM ranked r
WHERE sr.id = r.id AND r.rn = 1;

DELETE FROM "SurfaceRelation" WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "websiteRef", "edgeKey" ORDER BY "createdAt" DESC) AS rn
    FROM "SurfaceRelation"
  ) d WHERE d.rn > 1
);

-- 4. Now the column can be NOT NULL and the unique index can be built.
ALTER TABLE "SurfaceRelation" ALTER COLUMN "edgeKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SurfaceRelation_websiteRef_edgeKey_key"
  ON "SurfaceRelation"("websiteRef", "edgeKey");
CREATE INDEX IF NOT EXISTS "SurfaceRelation_websiteRef_lastSeenAt_idx"
  ON "SurfaceRelation"("websiteRef", "lastSeenAt");

-- 5. Evidence.auditCycleId carries onDelete: Cascade but Prisma does not
--    index relation child columns. Without this, deleting one AuditCycle
--    sequentially scans all of Evidence. Measured: 7,269 cycles took
--    hours before the index and 2.7 seconds after.
CREATE INDEX IF NOT EXISTS "Evidence_auditCycleId_idx" ON "Evidence"("auditCycleId");
