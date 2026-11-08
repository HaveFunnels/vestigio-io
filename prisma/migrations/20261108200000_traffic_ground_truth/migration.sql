-- The column we cannot measure, supplied by the person who can.
--
-- The dentist drew it in one sentence: "eu preencho duas celulas por
-- semana se voces me devolverem a costura. Agendados e compareceram. O
-- resto voces medem." The supplements seller asked from the other end:
-- he does not need a better rate, he needs to know what he changed.
--
-- Two tables because they are two shapes. Weekly numbers key on the
-- week and must be unique per week; a change log is an append-only
-- list of dated sentences with no uniqueness at all.
--
-- Additive, both empty on deploy. Every field here is deliberately one
-- the operator volunteered to fill: a column filled three times and
-- then abandoned is worse than an empty one, because a series built on
-- it looks continuous and is not.

CREATE TABLE "TrafficGroundTruth" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,

    -- Monday, matching date_trunc('week', day) in the series so the two
    -- join without a fuzzy date match.
    "week" TIMESTAMP(3) NOT NULL,

    -- Both nullable: a week with one number filled still beats a week
    -- skipped.
    "booked" INTEGER,
    "showed" INTEGER,
    "revenueBrl" INTEGER,

    -- Read by a human, never parsed.
    "note" TEXT,

    "enteredBy" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficGroundTruth_pkey" PRIMARY KEY ("id")
);

-- One row per week. Re-entering a week corrects it rather than
-- appending a second truth for the same seven days.
CREATE UNIQUE INDEX "TrafficGroundTruth_envId_week_key"
    ON "TrafficGroundTruth"("envId", "week");

CREATE INDEX "TrafficGroundTruth_envId_week_idx"
    ON "TrafficGroundTruth"("envId", "week");

ALTER TABLE "TrafficGroundTruth"
    ADD CONSTRAINT "TrafficGroundTruth_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "TrafficChange" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,

    -- The day it happened as the person remembers it, which is almost
    -- never the day they wrote it down. Both are kept.
    "happenedOn" TIMESTAMP(3) NOT NULL,
    "what" TEXT NOT NULL,
    -- Free text on purpose. Forcing a taxonomy here is how a log stops
    -- being written.
    "scope" TEXT,
    "who" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrafficChange_envId_happenedOn_idx"
    ON "TrafficChange"("envId", "happenedOn");

ALTER TABLE "TrafficChange"
    ADD CONSTRAINT "TrafficChange_envId_fkey"
    FOREIGN KEY ("envId") REFERENCES "Environment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
