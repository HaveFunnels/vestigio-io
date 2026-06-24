-- PV.9b — viewport screenshots of real crawled surfaces, stored in R2, surfaced in the Plano.
CREATE TABLE "SurfaceScreenshot" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "cycleRef" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurfaceScreenshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SurfaceScreenshot_environmentId_cycleRef_normalizedUrl_key" ON "SurfaceScreenshot"("environmentId", "cycleRef", "normalizedUrl");

CREATE INDEX "SurfaceScreenshot_environmentId_cycleRef_idx" ON "SurfaceScreenshot"("environmentId", "cycleRef");

ALTER TABLE "SurfaceScreenshot" ADD CONSTRAINT "SurfaceScreenshot_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
