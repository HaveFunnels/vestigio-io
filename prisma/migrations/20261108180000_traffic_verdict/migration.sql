-- What we recommended, and what happened to it.
--
-- Six of nine reviewers asked for this under six different names, and
-- it is the only category the two free competitors cannot enter. The
-- reason is incentive, not difficulty: a generative product cannot
-- publish its own error rate when its documentation already apologises
-- in advance, and a reporting product has nothing to score because it
-- issues no judgement.
--
-- Additive. Nothing reads it yet; the evaluation pass fills `outcome`
-- once enough time has passed, and null means "not yet", never "no
-- change".
--
-- The claim is copied into the row rather than recomputed later, which
-- is the entire point: a subsequent run must not be able to quietly
-- rewrite what we said. The ruler version rides along for the same
-- reason, since a verdict measured under one definition cannot be
-- scored against an outcome measured under another.

CREATE TABLE "TrafficVerdict" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "verdict" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The claim, frozen.
    "blindPct" DOUBLE PRECISION NOT NULL,
    "blindPctLow" DOUBLE PRECISION NOT NULL,
    "marginPoints" DOUBLE PRECISION NOT NULL,
    "sessions" INTEGER NOT NULL,
    "pauseCost" INTEGER NOT NULL,
    "pauseCostUnit" TEXT NOT NULL,
    "rulerVersion" INTEGER NOT NULL DEFAULT 1,

    -- What happened. Null until the evaluation pass can tell.
    "outcome" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "outcomeBlindPct" DOUBLE PRECISION,
    "outcomeDays" INTEGER,
    "acted" BOOLEAN,

    CONSTRAINT "TrafficVerdict_pkey" PRIMARY KEY ("id")
);

-- One verdict per thing per issuing run.
CREATE UNIQUE INDEX "TrafficVerdict_envId_dimension_key_issuedAt_key"
    ON "TrafficVerdict"("envId", "dimension", "key", "issuedAt");

CREATE INDEX "TrafficVerdict_envId_issuedAt_idx"
    ON "TrafficVerdict"("envId", "issuedAt");

-- The evaluation pass sweeps by outcome IS NULL.
CREATE INDEX "TrafficVerdict_envId_outcome_idx"
    ON "TrafficVerdict"("envId", "outcome");

ALTER TABLE "TrafficVerdict"
    ADD CONSTRAINT "TrafficVerdict_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
