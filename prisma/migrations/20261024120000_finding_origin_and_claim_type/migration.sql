-- Provenance and claim class on Finding.
--
-- `pack` is a subject category (revenue, saas) and says nothing about
-- where the evidence came from. Without `origin`, a counted
-- behavioural observation and a heuristic guess look identical once
-- persisted.
--
-- `claimType` separates a reproducible defect from an unusual reading,
-- from a real measurement with an unknown cause, from a hypothesis. A
-- detector firing is not proof of a defect, and this is the column
-- that keeps the plan from saying so.
--
-- Both nullable and both additive: historical rows are NOT
-- reclassified. Inferring the provenance of an old finding after the
-- fact would be inventing it, and these columns exist precisely to
-- stop that kind of invention.
ALTER TABLE "Finding" ADD COLUMN "origin" TEXT;
ALTER TABLE "Finding" ADD COLUMN "claimType" TEXT;
