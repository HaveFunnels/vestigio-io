"use client";

/**
 * StageLaneNode — Group node rendered as a funnel stage column/lane.
 * Shows a header with stage name and a subtle colored background.
 * Non-interactive — just a visual container for the stage's page nodes.
 */

interface StageLaneData {
  label: string;
  stageKey: string;
  stageColor: string;
}

export default function StageLaneNode({ data }: { data: StageLaneData }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${data.stageColor}20` }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: data.stageColor }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: data.stageColor }}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}
