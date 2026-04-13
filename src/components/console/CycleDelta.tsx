"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Cycle Delta — what changed since last audit
//
// Compact vertical timeline of changes.
// Each category: count badge + top finding headline.
// No card wrapper — lives inside the right column.
// ──────────────────────────────────────────────

interface CycleDeltaProps {
  workspaces: WorkspaceProjection[];
  filterPerspective?: string;
}

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

export default function CycleDelta({ workspaces, filterPerspective }: CycleDeltaProps) {
  const t = useTranslations("console.workspaces");

  const delta = useMemo(() => {
    const rows: { type: "regression" | "improvement" | "new"; count: number; top: string | null; color: string; icon: string }[] = [];
    let improved = 0, worsened = 0, newF = 0;
    let topI: string | null = null, topW: string | null = null, topN: string | null = null;

    for (const ws of workspaces) {
      if (filterPerspective && classifyWorkspacePerspective(ws) !== filterPerspective) continue;
      for (const f of ws.findings) {
        if (f.change_class === "improvement") { improved++; if (!topI) topI = f.title; }
        else if (f.change_class === "regression") { worsened++; if (!topW) topW = f.title; }
        else if (f.change_class === "new_issue") { newF++; if (!topN) topN = f.title; }
      }
    }

    if (worsened > 0) rows.push({ type: "regression", count: worsened, top: topW, color: "text-red-400", icon: "\u2191" });
    if (newF > 0) rows.push({ type: "new", count: newF, top: topN, color: "text-sky-400", icon: "\u2022" });
    if (improved > 0) rows.push({ type: "improvement", count: improved, top: topI, color: "text-emerald-400", icon: "\u2193" });

    return rows;
  }, [workspaces, filterPerspective]);

  return (
    <div>
      <h3 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
        {t("lenses.cycle_delta")}
      </h3>

      {delta.length === 0 ? (
        <p className="text-[12px] text-zinc-400 dark:text-zinc-600">{t("lenses.no_changes")}</p>
      ) : (
        <div className="space-y-2">
          {delta.map((row) => (
            <div key={row.type} className="flex items-start gap-2">
              {/* Count badge */}
              <span className={`font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-semibold tabular-nums ${row.color} w-5 shrink-0 text-right`}>
                {row.icon}{row.count}
              </span>
              {/* Headline */}
              <span className="truncate text-[12px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                {row.top}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
