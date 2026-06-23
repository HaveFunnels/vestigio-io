-- PV.8 — site-level content flags cache on Environment.
-- Nullable JSONB [{flag,present,confidence}], written by the perception pass
-- alongside perceivedVertical/perceivedSurfacesJson; read by getBusinessContext()
-- to gate content-attribute detectors (guarantee/credentials/curriculum/
-- response-time/contact) language-agnostically. Additive, nullable — behaviour-preserving.
ALTER TABLE "Environment" ADD COLUMN "perceivedContentFlagsJson" JSONB;
