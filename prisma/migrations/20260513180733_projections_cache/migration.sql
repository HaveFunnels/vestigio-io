-- Wave 16 — projectionsCache JSONB on AuditCycle.
--
-- Stores the serialized ProjectionResult (findings + actions + workspaces
-- + change_report + maps) so /api/projections and layout.tsx can skip the
-- per-page-load recomputeAll() that was causing 502 OOM as Evidence table
-- grew with Wave 13/14 off_site_recon entries.
--
-- Nullable: existing rows stay null until next audit writes; layout falls
-- back to the legacy MCP path while waiting for the first write.

ALTER TABLE "AuditCycle"
  ADD COLUMN "projectionsCache" JSONB;
