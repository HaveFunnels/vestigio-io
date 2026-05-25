-- Wave 22.6 — Monthly Strategy Plan (Pulse) — see docs/PLAN_MONTHLY_STRATEGY.md
--
-- Five new tables: MonthlyStrategyPlan + 4 child tables (PlanNextStep,
-- PlanComment, PlanEdit, PlanVersion). The plan is the core long-form
-- deliverable of Vestigio Pulse; the child tables hold the per-section
-- editable state, comment threads, edit proposals (MCP + manual), and
-- version snapshots for rollback + audit.
--
-- Cascade deletes: when an Environment is removed, all its plans go;
-- when a plan is removed, its child rows go. User relations are
-- non-cascade (SET NULL on assignee / author / approver) so removing
-- a user doesn't lose audit history.

-- ── MonthlyStrategyPlan ──
CREATE TABLE "MonthlyStrategyPlan" (
    "id"                    TEXT NOT NULL,
    "environmentId"         TEXT NOT NULL,
    "month"                 TEXT NOT NULL,
    "locale"                TEXT NOT NULL,
    "generatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRegenerated"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"                TEXT NOT NULL DEFAULT 'generating',
    "heroMetricsJson"       JSONB NOT NULL,
    "buyerSegmentsJson"     JSONB NOT NULL,
    "memoryRollupsJson"     JSONB NOT NULL,
    "valuePreviewJson"      JSONB NOT NULL,
    "narrativeWhatHappened" TEXT NOT NULL,
    "valuePreviewNarrative" TEXT NOT NULL,
    "llmCostCents"          INTEGER NOT NULL DEFAULT 0,
    "llmCallsCount"         INTEGER NOT NULL DEFAULT 0,
    "exportLockedUntil"     TIMESTAMP(3),
    "editLockedByMcpUntil"  TIMESTAMP(3),

    CONSTRAINT "MonthlyStrategyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyStrategyPlan_environmentId_month_key"
    ON "MonthlyStrategyPlan"("environmentId", "month");
CREATE INDEX "MonthlyStrategyPlan_environmentId_status_idx"
    ON "MonthlyStrategyPlan"("environmentId", "status");
CREATE INDEX "MonthlyStrategyPlan_environmentId_generatedAt_idx"
    ON "MonthlyStrategyPlan"("environmentId", "generatedAt");

ALTER TABLE "MonthlyStrategyPlan" ADD CONSTRAINT "MonthlyStrategyPlan_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PlanNextStep ──
CREATE TABLE "PlanNextStep" (
    "id"                   TEXT NOT NULL,
    "planId"               TEXT NOT NULL,
    "order"                INTEGER NOT NULL,
    "title"                TEXT NOT NULL,
    "reasoning"            TEXT NOT NULL,
    "procedureStepsJson"   JSONB NOT NULL,
    "researchRefsJson"     JSONB NOT NULL,
    "estimatedEffort"      TEXT NOT NULL,
    "suggestedOwner"       TEXT NOT NULL,
    "linkedActionRefsJson" JSONB NOT NULL,
    "status"               TEXT NOT NULL DEFAULT 'todo',
    "assigneeUserId"       TEXT,
    "dueAt"                TIMESTAMP(3),
    "doneAt"               TIMESTAMP(3),

    CONSTRAINT "PlanNextStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanNextStep_planId_order_idx"
    ON "PlanNextStep"("planId", "order");
CREATE INDEX "PlanNextStep_assigneeUserId_status_idx"
    ON "PlanNextStep"("assigneeUserId", "status");

ALTER TABLE "PlanNextStep" ADD CONSTRAINT "PlanNextStep_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "MonthlyStrategyPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanNextStep" ADD CONSTRAINT "PlanNextStep_assigneeUserId_fkey"
    FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PlanComment ──
CREATE TABLE "PlanComment" (
    "id"         TEXT NOT NULL,
    "planId"     TEXT NOT NULL,
    "sectionId"  TEXT NOT NULL,
    "authorId"   TEXT,
    "authorKind" TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt"   TIMESTAMP(3),
    "deletedAt"  TIMESTAMP(3),

    CONSTRAINT "PlanComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanComment_planId_sectionId_createdAt_idx"
    ON "PlanComment"("planId", "sectionId", "createdAt");

ALTER TABLE "PlanComment" ADD CONSTRAINT "PlanComment_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "MonthlyStrategyPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanComment" ADD CONSTRAINT "PlanComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PlanEdit ──
CREATE TABLE "PlanEdit" (
    "id"               TEXT NOT NULL,
    "planId"           TEXT NOT NULL,
    "sectionId"        TEXT NOT NULL,
    "editorKind"       TEXT NOT NULL,
    "editorUserId"     TEXT,
    "beforeText"       TEXT NOT NULL,
    "afterText"        TEXT NOT NULL,
    "reason"           TEXT,
    "proposedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"       TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "rejectedAt"       TIMESTAMP(3),
    "rejectedByUserId" TEXT,

    CONSTRAINT "PlanEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanEdit_planId_sectionId_proposedAt_idx"
    ON "PlanEdit"("planId", "sectionId", "proposedAt");
CREATE INDEX "PlanEdit_planId_approvedAt_idx"
    ON "PlanEdit"("planId", "approvedAt");

ALTER TABLE "PlanEdit" ADD CONSTRAINT "PlanEdit_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "MonthlyStrategyPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEdit" ADD CONSTRAINT "PlanEdit_editorUserId_fkey"
    FOREIGN KEY ("editorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanEdit" ADD CONSTRAINT "PlanEdit_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PlanVersion ──
CREATE TABLE "PlanVersion" (
    "id"            TEXT NOT NULL,
    "planId"        TEXT NOT NULL,
    "versionNum"    INTEGER NOT NULL,
    "snapshotJson"  JSONB NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByKind" TEXT NOT NULL,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanVersion_planId_versionNum_key"
    ON "PlanVersion"("planId", "versionNum");
CREATE INDEX "PlanVersion_planId_createdAt_idx"
    ON "PlanVersion"("planId", "createdAt");

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "MonthlyStrategyPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
