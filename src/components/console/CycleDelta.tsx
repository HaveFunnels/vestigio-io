"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Cycle Delta — compact list of what changed
//
// Shows: improved (green), worsened (red), new (blue)
// Each with count + top finding headline.
// ──────────────────────────────────────────────

interface CycleDeltaProps {
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

export default function CycleDelta({
  workspaces,
  filterPerspective,
}: CycleDeltaProps) {
  const t = useTranslations("console.workspaces");

  const delta = useMemo(() => {
    let improved = 0;
    let worsened = 0;
    let newFindings = 0;
    let topImproved: string | null = null;
    let topWorsened: string | null = null;
    let topNew: string | null = null;

    for (const ws of workspaces) {
      if (filterPerspective && classifyWorkspacePerspective(ws) !== filterPerspective)
        continue;

      for (const f of ws.findings) {
        if (f.change_class === "improvement") {
          improved++;
          if (!topImproved) topImproved = f.title;
        } else if (f.change_class === "regression") {
          worsened++;
          if (!topWorsened) topWorsened = f.title;
        } else if (f.change_class === "new_issue") {
          newFindings++;
          if (!topNew) topNew = f.title;
        }
      }
    }

    return { improved, worsened, newFindings, topImproved, topWorsened, topNew };
  }, [workspaces, filterPerspective]);

  const hasChanges =
    delta.improved > 0 || delta.worsened > 0 || delta.newFindings > 0;

  if (!hasChanges) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {t("lenses.cycle_delta")}
        </h3>
        <p className="text-sm text-content-faint">{t("lenses.no_changes")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
        {t("lenses.cycle_delta")}
      </h3>

      {/* Summary line */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {delta.improved > 0 && (
          <span className="font-[family-name:var(--font-jetbrains-mono)] font-medium text-emerald-400">
            {delta.improved} {t("lenses.improved")}
          </span>
        )}
        {delta.worsened > 0 && (
          <span className="font-[family-name:var(--font-jetbrains-mono)] font-medium text-red-400">
            {delta.worsened} {t("lenses.worsened")}
          </span>
        )}
        {delta.newFindings > 0 && (
          <span className="font-[family-name:var(--font-jetbrains-mono)] font-medium text-blue-400">
            {delta.newFindings} {t("lenses.new_findings")}
          </span>
        )}
      </div>

      {/* Detail rows */}
      <div className="space-y-2">
        {delta.improved > 0 && delta.topImproved && (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-emerald-400">{"\u2193"}</span>
            <div className="min-w-0 flex-1">
              <span className="truncate text-xs text-content-secondary">
                {delta.topImproved}
              </span>
            </div>
          </div>
        )}
        {delta.worsened > 0 && delta.topWorsened && (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-red-400">{"\u2191"}</span>
            <div className="min-w-0 flex-1">
              <span className="truncate text-xs text-content-secondary">
                {delta.topWorsened}
              </span>
            </div>
          </div>
        )}
        {delta.newFindings > 0 && delta.topNew && (
          <div className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
            <div className="min-w-0 flex-1">
              <span className="truncate text-xs text-content-secondary">
                {delta.topNew}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
