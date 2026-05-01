"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";

const HATCH_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)",
  backgroundBlendMode: "normal",
  opacity: 0.9,
};

export default function JourneyDropoffNode({ data }: { data: any }) {
  const t = useTranslations("console.maps");
  const rate =
    typeof data.conversionRate === "number" ? data.conversionRate : null;
  return (
    <div className="relative min-w-[140px] max-w-[180px] overflow-hidden rounded-md border border-dashed border-red-500/40 bg-red-500/5 px-3 py-2 text-red-500">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-red-500/20"
        style={HATCH_STYLE}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-red-400"
      />
      <div className="relative text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
        {t("journey.dropoff")}
      </div>
      {rate !== null && (
        <div className="relative mt-0.5 font-mono text-xs tabular-nums text-red-600 dark:text-red-400">
          {rate}%
        </div>
      )}
    </div>
  );
}
