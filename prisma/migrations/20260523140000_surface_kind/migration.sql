-- Wave 22.5 — surface_kind columns on Finding + Action.
--
-- Nullable string columns (no enum at the DB level — Prisma stores
-- the enum as a string anyway, and keeping the column open-ended lets
-- us add new surface kinds in code without a schema migration).
--
-- Existing rows stay NULL until the next cycle re-runs through the
-- surface-aware engine. The downstream `effectiveSurfaceKind` helper
-- in packages/domain/surface.ts treats NULL as 'public' so legacy
-- findings continue to be visible on every filter view that doesn't
-- explicitly require 'authenticated'.

ALTER TABLE "Finding" ADD COLUMN "surfaceKind" TEXT;
ALTER TABLE "Action" ADD COLUMN "surfaceKind" TEXT;

-- Filter indexes for "show me only public findings" / "show me only
-- authenticated app findings" queries that the UI exposes.
CREATE INDEX "Finding_environmentId_surfaceKind_idx"
    ON "Finding"("environmentId", "surfaceKind");

CREATE INDEX "Action_environmentId_surfaceKind_idx"
    ON "Action"("environmentId", "surfaceKind");
