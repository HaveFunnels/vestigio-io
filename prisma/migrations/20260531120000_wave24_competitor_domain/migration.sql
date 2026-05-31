-- Wave 24 — competitive lens: user-curated list of competitor
-- domains observed each audit cycle.

CREATE TABLE "CompetitorDomain" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "discoveryMethod" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedBy" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitorDomain_environmentId_domain_key" ON "CompetitorDomain"("environmentId", "domain");
CREATE INDEX "CompetitorDomain_environmentId_active_addedAt_idx" ON "CompetitorDomain"("environmentId", "active", "addedAt");

ALTER TABLE "CompetitorDomain" ADD CONSTRAINT "CompetitorDomain_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
