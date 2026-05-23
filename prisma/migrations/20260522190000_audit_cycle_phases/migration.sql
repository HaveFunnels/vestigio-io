-- Wave 22 Fase B — phase-level progress on AuditCycle.
--
-- Three nullable columns let the audit-runner persist each phase
-- transition (graph_and_signals → core_inferences → ...) as the
-- recompute generator yields. The dashboard SSE stream reads these
-- to render fine-grained progress without polling the engine, and
-- the heal cron uses phaseUpdatedAt as an additional stuck-in-phase
-- signal (more specific than just heartbeat staleness).

ALTER TABLE "AuditCycle" ADD COLUMN "currentPhase" TEXT;
ALTER TABLE "AuditCycle" ADD COLUMN "phaseUpdatedAt" TIMESTAMP(3);
ALTER TABLE "AuditCycle" ADD COLUMN "phaseHistory" JSONB;
