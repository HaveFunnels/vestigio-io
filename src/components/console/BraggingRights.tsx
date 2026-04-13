"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Bragging Rights — what you're doing right
//
// Compact list: resolved count + positive checks.
// Green accent. No card wrapper — sits inline.
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
      <h3 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-500/60">
        {t("lenses.bragging_rights")}
      </h3>

      {resolvedCount > 0 && (
        <div className="mb-2.5 flex items-baseline gap-1.5">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[18px] font-bold tabular-nums text-emerald-400">
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
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-emerald-500/50" />
              <span className="text-[11px] leading-[1.5] text-zinc-500">
                {check}
              </span>
            </div>
          ))}
          {positiveChecks.length > 5 && (
            <span className="text-[10px] text-zinc-600">
              +{positiveChecks.length - 5} {t("lenses.more_checks")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
