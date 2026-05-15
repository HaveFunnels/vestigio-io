-- BusinessProfile.ownershipConfirmedAt — timestamp the owner ticked the
-- "I own this domain" checkbox during onboarding. Captured for legal /
-- abuse posture in case a domain is ever disputed.
--
-- The onboarding UI required this checkbox to advance but never persisted
-- it (the value was stripped by the activate-route Zod schema). New schema
-- field + persistence path lets us actually answer "did the owner ever
-- confirm ownership, and when?".

ALTER TABLE "BusinessProfile"
  ADD COLUMN "ownershipConfirmedAt" TIMESTAMP(3);
