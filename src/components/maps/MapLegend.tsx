"use client";

import { useTranslations } from "next-intl";
import { NODE_SWATCH_CLASS, EDGE_SWATCH_CLASS } from "./map-utils";
import type { MapDefinition } from "../../../packages/maps";

export default function MapLegend({
  legend,
}: {
  legend: MapDefinition["legend"];
}) {
  const t = useTranslations("console.maps.legend");

  if (
    (!legend?.nodes || legend.nodes.length === 0) &&
    (!legend?.edges || legend.edges.length === 0)
  ) {
    return null;
  }

  return (
    <div className="border-t border-edge px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-content-muted">
        {legend.nodes.map((entry) => (
          <span
            key={`n:${entry.swatch}`}
            className="flex items-center gap-1.5"
          >
            <span
              className={`inline-block h-3 w-3 rounded border-2 ${
                NODE_SWATCH_CLASS[entry.swatch] ||
                "border-content-muted bg-surface-inset"
              }`}
            />
            {t(entry.labelKey)}
          </span>
        ))}
        {legend.edges.length > 0 && legend.nodes.length > 0 && (
          <span
            className="hidden h-4 w-px bg-edge sm:block"
            aria-hidden
          />
        )}
        {legend.edges.map((entry) => (
          <span
            key={`e:${entry.swatch}`}
            className="flex items-center gap-1.5"
          >
            <span
              className={`inline-block h-0.5 w-4 ${
                EDGE_SWATCH_CLASS[entry.swatch] || "bg-content-muted"
              }`}
            />
            {t(entry.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}
