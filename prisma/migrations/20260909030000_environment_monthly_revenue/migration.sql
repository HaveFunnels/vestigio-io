-- Per-environment declared revenue. The org-level figure on
-- BusinessProfile cannot be attributed to one environment once an org
-- has several (HaveFunnels: R$ 580k org-wide over two stores), and the
-- exposure cap introduced in the casamontelle cross-exam response needs
-- a per-environment base to mean anything.
ALTER TABLE "Environment" ADD COLUMN IF NOT EXISTS "monthlyRevenue" DOUBLE PRECISION;
