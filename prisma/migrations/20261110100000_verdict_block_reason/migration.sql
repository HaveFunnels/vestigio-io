-- Why a cut was withheld, recorded on the verdict itself.
--
-- Asked for by the council's statistician, and his argument is the
-- reason this is not cosmetic. The engine already pushes verdicts away
-- from "cortar": three deterministic guards withhold it when the
-- conversion measurement looks broken, when the campaign fills the
-- checkout, or when a zero purchase count is probable by sampling
-- luck. That conservatism was deliberate and he approved it.
--
-- Now a second force may push in the same direction. If Vestigio ever
-- authors what it judges (a campaign structure, or a creative), the
-- cost of admitting a wrong recommendation goes up, because it also
-- admits a wrong authorship. That bias pushes verdicts away from
-- "cortar" too.
--
-- Two causes, one effect, same sign. In his words: the authorship bias
-- is not identifiable in the current design, because if the cut rate
-- falls tomorrow nobody can distinguish "the guard acted" from "we are
-- protecting our own work". That is collinearity, and no volume of
-- data resolves collinearity.
--
-- Logging which guard acted breaks the collinearity: condition on the
-- guard and the free-judgement distribution comes back. He was
-- explicit that this is worth doing even if the product never teaches
-- or generates anything, because without it every future test of
-- self-flattery is inconclusive by construction.

ALTER TABLE "TrafficVerdict"
    ADD COLUMN "blockReason" TEXT,
    -- How often a campaign converting at the account rate would have
    -- shown zero purchases at this sample size. Frozen with the
    -- verdict, because it is part of the claim: it says how much the
    -- zero was worth as evidence at the moment we spoke.
    ADD COLUMN "falseZeroRiskPct" DOUBLE PRECISION,
    -- Which rung of the ladder the verdict was about, when one was
    -- named. Lets the scoreboard be read by rung rather than only in
    -- aggregate.
    ADD COLUMN "leakStep" TEXT;

-- The sweep that scores verdicts will want to slice by guard.
CREATE INDEX "TrafficVerdict_envId_blockReason_idx"
    ON "TrafficVerdict"("envId", "blockReason");
