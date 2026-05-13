-- Wave 9.3 M3 — A/B test platform detection. Records which (if any)
-- experimentation tool we detected on the page (optimizely, vwo, etc.).
ALTER TABLE "PageInventoryItem"
ADD COLUMN "abTestPlatform" TEXT;
