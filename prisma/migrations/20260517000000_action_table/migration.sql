-- Wave 18t-B: Action as a relational table mirroring the Finding pattern.
-- Powers SQL-driven /app/actions queries (severity / category / surface
-- filters, server-side pagination, cross-cycle telemetry, dashboard
-- dedupe via GROUP BY decisionKey). Coexists with projectionsCache.

CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "cycleRef" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "decisionKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "impactMin" DOUBLE PRECISION,
    "impactMax" DOUBLE PRECISION,
    "impactMidpoint" DOUBLE PRECISION,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "surface" TEXT,
    "inferenceKeysJson" TEXT,
    "projection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Action_cycleId_actionKey_key" ON "Action"("cycleId", "actionKey");
CREATE INDEX "Action_environmentId_cycleId_idx" ON "Action"("environmentId", "cycleId");
CREATE INDEX "Action_environmentId_severity_idx" ON "Action"("environmentId", "severity");
CREATE INDEX "Action_environmentId_category_idx" ON "Action"("environmentId", "category");
CREATE INDEX "Action_environmentId_surface_idx" ON "Action"("environmentId", "surface");
CREATE INDEX "Action_environmentId_decisionKey_idx" ON "Action"("environmentId", "decisionKey");
CREATE INDEX "Action_cycleRef_actionKey_idx" ON "Action"("cycleRef", "actionKey");

ALTER TABLE "Action" ADD CONSTRAINT "Action_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
