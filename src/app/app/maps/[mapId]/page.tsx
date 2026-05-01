"use client";

import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import { ShinyButton } from "@/components/ui/shiny-button";
import { loadAllMaps } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import MapCanvas from "@/components/maps/MapCanvas";
import JourneyFiltersBar, {
  type JourneyFilters,
  type JourneyStage,
  type JourneyRange,
  pickStage,
  pickRange,
  JOURNEY_STAGES,
} from "@/components/maps/JourneyFiltersBar";
import type { MapDefinition } from "../../../../../packages/maps";

// ──────────────────────────────────────────────
// Page — single-map canvas view. Routed at /app/maps/[mapId].
// ──────────────────────────────────────────────

const JOURNEY_MAP_ID = "user_journey";

export default function MapCanvasPage() {
  const t = useTranslations("console.maps");
  const tc = useTranslations("console.common");
  const params = useParams<{ mapId: string }>();
  const mapId = typeof params?.mapId === "string" ? params.mapId : "";

  const mcpData = useMcpData();
  const dataState =
    mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

  if (mapId === JOURNEY_MAP_ID) {
    return (
      <Suspense fallback={<MapLoadingShell label={t("loading")} />}>
        <JourneyCanvasView t={t} tc={tc} />
      </Suspense>
    );
  }

  // Custom maps (IDs prefixed with "custom_")
  if (mapId.startsWith("custom_")) {
    return <CustomMapView mapId={mapId} t={t} tc={tc} />;
  }

  // Engine maps
  return (
    <div className="flex h-full flex-col">
      <ConsoleState
        state={dataState}
        loadingLabel={t("loading")}
        emptyLabel={t("empty")}
      >
        {(maps) => {
          const found = maps.find((m) => m.id === mapId);
          if (!found) {
            return <MapNotFound backLabel={t("back_to_gallery")} />;
          }
          return <MapCanvasShell mapDef={found} t={t} tc={tc} />;
        }}
      </ConsoleState>
    </div>
  );
}

// ──────────────────────────────────────────────
// Custom map view
// ──────────────────────────────────────────────

function CustomMapView({
  mapId,
  t,
  tc,
}: {
  mapId: string;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const [mapDef, setMapDef] = useState<MapDefinition | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const dbId = mapId.replace(/^custom_/, "");
    fetch(`/api/maps/custom/${dbId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.map) setMapDef(data.map as MapDefinition);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [mapId]);

  if (!loaded) {
    return <MapLoadingShell label={t("loading")} />;
  }
  if (!mapDef) {
    return <MapNotFound backLabel={t("back_to_gallery")} />;
  }
  return <MapCanvasShell mapDef={mapDef} t={t} tc={tc} />;
}

// ──────────────────────────────────────────────
// Journey canvas view
// ──────────────────────────────────────────────

function JourneyCanvasView({
  t,
  tc,
}: {
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters: JourneyFilters = useMemo(
    () => ({
      start: pickStage(searchParams?.get("start")),
      end: pickStage(searchParams?.get("end")),
      range: pickRange(searchParams?.get("range")),
    }),
    [searchParams],
  );

  const [journeyMap, setJourneyMap] = useState<MapDefinition | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const qs = new URLSearchParams({
      start: filters.start,
      end: filters.end,
      range: filters.range,
    }).toString();
    fetch(`/api/maps/user-journey?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Journey API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setJourneyMap(data?.map ? (data.map as MapDefinition) : null);
      })
      .catch((err) => {
        console.error("[JourneyCanvasView]", err);
        setJourneyMap(null);
      })
      .finally(() => setLoaded(true));
  }, [filters.start, filters.end, filters.range]);

  const updateFilter = useCallback(
    (patch: Partial<JourneyFilters>) => {
      const next = { ...filters, ...patch };
      const qs = new URLSearchParams();
      if (next.start !== "any") qs.set("start", next.start);
      if (next.end !== "any") qs.set("end", next.end);
      if (next.range !== "30d") qs.set("range", next.range);
      const suffix = qs.toString();
      router.replace(
        `/app/maps/${JOURNEY_MAP_ID}${suffix ? `?${suffix}` : ""}`,
        { scroll: false },
      );
    },
    [filters, router],
  );

  const mode =
    (journeyMap?.metadata as Record<string, unknown> | undefined)?.mode;

  return (
    <div className="flex h-full flex-col">
      <MapCanvasHeader mapDef={journeyMap} t={t} tc={tc} />
      <JourneyFiltersBar filters={filters} onChange={updateFilter} mode={mode} />
      <div className="flex-1">
        {!loaded ? (
          <MapLoadingShell label={t("loading")} />
        ) : !journeyMap ? (
          <JourneyEmptyState
            onReset={() => updateFilter({ start: "any", end: "any" })}
          />
        ) : (
          <MapCanvas mapDef={journeyMap} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Shared sub-components
// ──────────────────────────────────────────────

function JourneyEmptyState({ onReset }: { onReset: () => void }) {
  const t = useTranslations("console.maps");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-sm font-medium text-content">
        {t("journey.empty_title")}
      </div>
      <div className="max-w-sm text-xs text-content-muted">
        {t("journey.empty_body")}
      </div>
      <button
        onClick={onReset}
        className="mt-2 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover"
      >
        {t("journey.reset_filters")}
      </button>
    </div>
  );
}

function MapCanvasHeader({
  mapDef,
  t,
  tc,
}: {
  mapDef: MapDefinition | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge px-6 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/app/maps"
          className="shrink-0 rounded-md border border-edge p-1.5 text-content-muted transition-colors hover:border-edge-strong hover:text-content-secondary"
          aria-label={t("back_to_gallery")}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        <div className="[&>div]:mb-0">
          <PageHeader
            title={mapDef?.name || t("title")}
            tooltip={
              mapDef
                ? (t(`descriptions.${mapDef.type}` as never) as string)
                : (tc("page_tooltips.maps") as string)
            }
          />
        </div>
      </div>
      {mapDef && (
        <ShinyButton
          variant="console"
          onClick={() =>
            (window.location.href = `/app/chat?context=map:${encodeURIComponent(mapDef.id)}`)
          }
        >
          {t("useAsContext")}
        </ShinyButton>
      )}
    </div>
  );
}

function MapLoadingShell({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-muted">
      {label}
    </div>
  );
}

function MapNotFound({ backLabel }: { backLabel: string }) {
  const t = useTranslations("console.maps");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-sm font-medium text-content">
        {t("not_found.title")}
      </div>
      <div className="max-w-sm text-xs text-content-muted">
        {t("not_found.body")}
      </div>
      <Link
        href="/app/maps"
        className="mt-2 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover"
      >
        &larr; {backLabel}
      </Link>
    </div>
  );
}

function MapCanvasShell({
  mapDef,
  t,
  tc,
}: {
  mapDef: MapDefinition;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex h-full flex-col">
      <MapCanvasHeader mapDef={mapDef} t={t} tc={tc} />
      <MapCanvas mapDef={mapDef} />
    </div>
  );
}
