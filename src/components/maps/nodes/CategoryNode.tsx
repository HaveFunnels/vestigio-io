"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";

export default function CategoryNode({ data }: { data: any }) {
  const t = useTranslations("console.maps");
  return (
    <div className="min-w-[160px] rounded-md border border-blue-600/50 bg-blue-500/10 px-4 py-3">
      <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
        {data.label || t("nodeTypes.category")}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-blue-500"
      />
    </div>
  );
}
