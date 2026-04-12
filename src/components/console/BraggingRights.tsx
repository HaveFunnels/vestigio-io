"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Bragging Rights — "What you're doing right"
//
// Green checkmarks for positive checks.
// Resolved findings counter. Subtle emerald-tinted card.
// Celebratory but understated.
// ──────────────────────────────────────────────

interface BraggingRightsProps {
  workspaces: WorkspaceProjection[];
  /** Filter to a single perspective */
  filterPerspective?: string;
}

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

export default function BraggingRights({
  workspaces,
  filterPerspective,
}: BraggingRightsProps) {
  const t = useTranslations("console.workspaces");

  const { positiveChecks, resolvedCount } = useMemo(() => {
    const checks: string[] = [];
    let resolved = 0;

    for (const ws of workspaces) {
      if (filterPerspective && classifyWorkspacePerspective(ws) !== filterPerspective)
        continue;

      for (const f of ws.findings) {
        if (f.polarity === "positive") {
          checks.push(f.title);
        }
        if (f.change_class === "resolved") {
          resolved++;
        }
      }
    }

    return { positiveChecks: checks, resolvedCount: resolved };
  }, [workspaces, filterPerspective]);

  if (positiveChecks.length === 0 && resolvedCount === 0) return null;

  return (
    <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-400/70">
        {t("lenses.bragging_rights")}
      </h3>

      {resolvedCount > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-sm font-semibold text-emerald-400">
            {resolvedCount}
          </span>
          <span className="text-xs text-emerald-300/70">
            {t("lenses.resolved_this_cycle")}
          </span>
        </div>
      )}

      {positiveChecks.length > 0 && (
        <div className="space-y-1.5">
          {positiveChecks.slice(0, 6).map((check, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-xs font-bold text-emerald-400">
                {"\u2713"}
              </span>
              <span className="text-xs leading-relaxed text-content-secondary">
                {check}
              </span>
            </div>
          ))}
          {positiveChecks.length > 6 && (
            <span className="text-[11px] text-content-faint">
              +{positiveChecks.length - 6} {t("lenses.more_checks")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
