-- Wave 22 — enforce one domain per org on Environment.
--
-- The schema previously allowed duplicate (organizationId, domain) rows,
-- which let the UI create the same domain twice and produce confused
-- dashboard state for the customer. The new env-add flow rejects
-- duplicates at the API layer; this index is the DB-level guarantee.
--
-- If a customer happens to have pre-existing duplicates (very unlikely
-- given the API has been the only writer), this migration will fail
-- and the operator must dedupe manually before re-running. A failed
-- ADD CONSTRAINT is visible and safe — the alternative (silent DELETE
-- to dedupe) is destructive and indistinguishable from data loss.

CREATE UNIQUE INDEX "Environment_organizationId_domain_key" ON "Environment"("organizationId", "domain");
