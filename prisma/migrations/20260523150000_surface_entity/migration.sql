-- Wave 22.5 Tier 3 — Surface as a first-class entity.
--
-- Adds the Surface table + seeds one default Surface per existing
-- Environment (kind='public', urlPattern='*', label='Site público').
-- Default seed means behavior is unchanged for legacy envs — the
-- engine falls back to the catch-all surface, which classifies every
-- URL as Public, matching the pre-Wave-22.5 default.
--
-- Operators add additional surfaces (e.g. an authenticated subdomain)
-- via /app/settings/surfaces. The engine consults declarations to
-- classify URLs; the URL-substring heuristic in classifySurfaceByUrl
-- is only a fallback for envs that have ONLY the catch-all surface.

CREATE TABLE "Surface" (
    "id"            TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "kind"          TEXT NOT NULL,
    "urlPattern"    TEXT NOT NULL,
    "label"         TEXT NOT NULL,
    "authRequired"  BOOLEAN NOT NULL DEFAULT false,
    "displayOrder"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Surface_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Surface_environmentId_urlPattern_key"
    ON "Surface"("environmentId", "urlPattern");
CREATE INDEX "Surface_environmentId_displayOrder_idx"
    ON "Surface"("environmentId", "displayOrder");

ALTER TABLE "Surface" ADD CONSTRAINT "Surface_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: one default catch-all Surface per existing Environment. The
-- INSERT ... SELECT generates a UUID-shaped id from gen_random_uuid()
-- (the same generator Prisma's @default(cuid()) uses on new rows would
-- be a cuid, but the format doesn't matter for FK integrity; the
-- runtime helpers index by environmentId).
INSERT INTO "Surface" ("id", "environmentId", "kind", "urlPattern", "label", "authRequired", "displayOrder", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::TEXT,
    e."id",
    'public',
    '*',
    'Site público',
    FALSE,
    100,
    NOW(),
    NOW()
FROM "Environment" e
WHERE NOT EXISTS (
    SELECT 1 FROM "Surface" s
    WHERE s."environmentId" = e."id" AND s."urlPattern" = '*'
);
