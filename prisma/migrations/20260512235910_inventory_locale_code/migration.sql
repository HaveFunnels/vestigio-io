-- Wave 9.3 M4 — locale tracking. localeCode comes from <html lang="…">.
-- Used together with hreflang-driven discovery so multi-locale sites
-- can be grouped/filtered in the inventory.
ALTER TABLE "PageInventoryItem"
ADD COLUMN "localeCode" TEXT;
