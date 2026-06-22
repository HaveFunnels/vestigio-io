-- PV.2.1 — per-surface perceived purpose cache on Environment.
-- Nullable JSONB [{url,purpose,confidence}], written by the perception pass
-- alongside perceivedVertical; read by getBusinessContext(). Unread until PV.3.
ALTER TABLE "Environment" ADD COLUMN "perceivedSurfacesJson" JSONB;
