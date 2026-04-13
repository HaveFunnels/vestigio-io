"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Cycle Delta — what changed since last audit
// Styled to match dashboard widget cards.
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
    const rows: { type: string; count: number; top: string | null; color: string; icon: string }[] = [];
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
    if (newF > 0) rows.push({ type: "new", count: newF, top: topN, color: "text-emerald-400", icon: "\u002B" });
    if (improved > 0) rows.push({ type: "improvement", count: improved, top: topI, color: "text-emerald-400", icon: "\u2193" });

    return rows;
  }, [workspaces, filterPerspective]);

  return (
    <div>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
        {t("lenses.cycle_delta")}
      </div>

      {delta.length === 0 ? (
        <p className="text-xs text-content-faint">{t("lenses.no_changes")}</p>
      ) : (
        <div className="space-y-2">
          {delta.map((row) => (
            <div key={row.type} className="flex items-start gap-2">
              <span className={`font-mono text-[13px] font-medium tabular-nums ${row.color} w-6 shrink-0 text-right`}>
                {row.icon}{row.count}
              </span>
              <span className="truncate text-xs leading-[1.5] text-content-secondary">
                {row.top}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
