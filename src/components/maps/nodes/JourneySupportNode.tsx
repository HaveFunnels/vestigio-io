"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";

export default function JourneySupportNode({ data }: { data: any }) {
  const t = useTranslations("console.maps");
  return (
    <div className="min-w-[160px] max-w-[200px] rounded-md border border-dashed border-edge bg-surface-card/50 px-3 py-2">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-content-faint"
      />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">
        {t(`page_types.${data.pageType || "page"}` as never)}
      </div>
      <div
        className="mt-0.5 truncate text-xs text-content-muted"
        title={data.label}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-content-faint"
      />
    </div>
  );
}
