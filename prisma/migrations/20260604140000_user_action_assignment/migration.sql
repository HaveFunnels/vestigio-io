-- Wave-22.6-review fix: UC4 — explicit assignment on UserAction.
--
-- Previously /api/actions/user listed by (organizationId, environmentId)
-- and returned every member's actions to every viewer — the "Mine"
-- tab on /app/actions silently broke the multi-player delegation
-- use case promised by the landing page.
--
-- assignedToUserId is the canonical owner of the action. Existing
-- rows backfill to createdByUserId (write owns by default).

ALTER TABLE "UserAction"
  ADD COLUMN "assignedToUserId" TEXT;

UPDATE "UserAction"
  SET "assignedToUserId" = "createdByUserId"
  WHERE "assignedToUserId" IS NULL;

ALTER TABLE "UserAction"
  ADD CONSTRAINT "UserAction_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UserAction_environmentId_assignedToUserId_status_idx"
  ON "UserAction" ("environmentId", "assignedToUserId", "status");
