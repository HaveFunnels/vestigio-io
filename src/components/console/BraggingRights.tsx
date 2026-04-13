"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Bragging Rights — what you're doing right
// Styled to match dashboard widget cards.
// ──────────────────────────────────────────────

interface BraggingRightsProps {
  workspaces: WorkspaceProjection[];
  filterPerspective?: string;
}

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

export default function BraggingRights({ workspaces, filterPerspective }: BraggingRightsProps) {
  const t = useTranslations("console.workspaces");

  const { positiveChecks, resolvedCount } = useMemo(() => {
    const checks: string[] = [];
    let resolved = 0;
    for (const ws of workspaces) {
      if (filterPerspective && classifyWorkspacePerspective(ws) !== filterPerspective) continue;
      for (const f of ws.findings) {
        if (f.polarity === "positive") checks.push(f.title);
        if (f.change_class === "resolved") resolved++;
      }
    }
    return { positiveChecks: checks, resolvedCount: resolved };
  }, [workspaces, filterPerspective]);

  if (positiveChecks.length === 0 && resolvedCount === 0) return null;

  return (
    <div>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
        {t("lenses.bragging_rights")}
      </div>

      {resolvedCount > 0 && (
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="font-mono text-lg font-medium tabular-nums text-emerald-400">
            {resolvedCount}
          </span>
          <span className="text-[11px] text-emerald-400/60">
            {t("lenses.resolved_this_cycle")}
          </span>
        </div>
      )}

      {positiveChecks.length > 0 && (
        <div className="space-y-1">
          {positiveChecks.slice(0, 5).map((check, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/50" />
              <span className="text-[11px] leading-[1.5] text-content-secondary">
                {check}
              </span>
            </div>
          ))}
          {positiveChecks.length > 5 && (
            <span className="text-[10px] text-content-faint">
              +{positiveChecks.length - 5} {t("lenses.more_checks")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
