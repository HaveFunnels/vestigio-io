"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "../map-utils";

export default function ActionNode({ data }: { data: any }) {
  const t = useTranslations("console.maps");
  return (
    <div className="min-w-[180px] cursor-pointer rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 transition-shadow hover:shadow-lg hover:shadow-emerald-500/10">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500"
      />
      <div className="text-xs text-emerald-600 dark:text-emerald-400">
        {t("nodeTypes.action")}
      </div>
      <div className="mt-0.5 text-sm text-content-secondary">{data.label}</div>
      {data.impact && (
        <div className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
          {t("impact_unlocks", {
            amount: formatCurrency(data.impact.midpoint),
          })}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500"
      />
    </div>
  );
}
