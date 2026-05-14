-- AuditCycle had zero indices, which means every status / env / heal-cron
-- lookup did a full table scan. Add the three indices that cover the hot
-- read patterns (see schema.prisma for the call sites).
--
-- These are plain CREATE INDEX (NOT CONCURRENTLY) because Prisma migrate
-- wraps statements in transactions and CONCURRENTLY cannot run inside a
-- transaction. At current scale the brief ACCESS EXCLUSIVE lock during
-- index build is acceptable (AuditCycle is small — hundreds to thousands
-- of rows). When the table grows past ~100k rows the locks during this
-- migration would matter, at which point the same indices should be
-- recreated CONCURRENTLY via direct psql (Prisma cannot do CONCURRENTLY).

CREATE INDEX "AuditCycle_environmentId_status_completedAt_idx"
  ON "AuditCycle" ("environmentId", "status", "completedAt");

CREATE INDEX "AuditCycle_status_createdAt_idx"
  ON "AuditCycle" ("status", "createdAt");

CREATE INDEX "AuditCycle_organizationId_createdAt_idx"
  ON "AuditCycle" ("organizationId", "createdAt");
