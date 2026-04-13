"use client";

import { useTranslations } from "next-intl";
import ChangeBadge from "@/components/console/ChangeBadge";
import type { DecisionChangeProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// ChangeTimeline — Phase 2 UX
//
// Vertical timeline showing decision-level changes
// ordered by criticality: regressions, new issues,
// stable risks, improvements, resolved.
// ──────────────────────────────────────────────

const changeClassOrder: Record<string, number> = {
  regression: 0,
  new_issue: 1,
  stable_risk: 2,
  improvement: 3,
  resolved: 4,
};

const dotColors: Record<string, string> = {
  regression: "bg-red-500",
  new_issue: "bg-blue-500",
  stable_risk: "bg-amber-500",
  improvement: "bg-emerald-500",
  resolved: "bg-emerald-500",
};

const lineColors: Record<string, string> = {
  regression: "bg-red-500/30",
  new_issue: "bg-blue-500/30",
  stable_risk: "bg-amber-500/30",
  improvement: "bg-emerald-500/30",
  resolved: "bg-emerald-500/30",
};

export default function ChangeTimeline({
  changes,
  maxItems = 10,
}: {
  changes: DecisionChangeProjection[];
  maxItems?: number;
}) {
  const t = useTranslations("console.change_timeline");

  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-surface-card px-4 py-6 text-center">
        <span className="text-sm text-content-muted">{t("no_changes")}</span>
      </div>
    );
  }

  // Sort by criticality order, then by absolute risk delta (most impactful first)
  const sorted = [...changes]
    .sort((a, b) => {
      const orderA = changeClassOrder[a.change_class] ?? 99;
      const orderB = changeClassOrder[b.change_class] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return Math.abs(b.risk_score_delta) - Math.abs(a.risk_score_delta);
    })
    .slice(0, maxItems);

  return (
    <div className="relative">
      {sorted.map((change, idx) => {
        const isLast = idx === sorted.length - 1;
        const dot = dotColors[change.change_class] || "bg-content-faint";
        const line = lineColors[change.change_class] || "bg-edge";

        return (
          <div key={`${change.decision_key}-${idx}`} className="relative flex gap-4">
            {/* Left: dot + connecting line */}
            <div className="flex flex-col items-center">
              <div
                className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dot} ring-2 ring-surface`}
              />
              {!isLast && (
                <div className={`w-0.5 flex-1 ${line}`} />
              )}
            </div>

            {/* Right: content */}
            <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
              {/* Title */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-content-secondary">
                  {change.title}
                </span>
                <ChangeBadge
                  value={change.change_class as any}
                />
              </div>

              {/* Risk delta */}
              <div className="mt-1">
                <RiskDelta delta={change.risk_score_delta} />
              </div>

              {/* Severity change */}
              {change.previous_severity && change.current_severity && change.previous_severity !== change.current_severity && (
                <div className="mt-1 text-xs text-content-muted">
                  {t("severity_label")}: {change.previous_severity} &rarr; {change.current_severity}
                </div>
              )}

              {/* Contributing factors */}
              {change.contributing_factors.length > 0 && (
                <div className="mt-1 text-xs text-content-muted">
                  {change.contributing_factors.join(", ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Risk Delta Badge
// ──────────────────────────────────────────────

function RiskDelta({ delta }: { delta: number }) {
  const t = useTranslations("console.change_timeline");

  if (delta === 0) {
    return <span className="text-xs text-content-muted">{t("no_risk_change")}</span>;
  }

  const isWorse = delta > 0;
  const sign = isWorse ? "+" : "";
  const color = isWorse ? "text-red-400" : "text-emerald-400";

  return (
    <span className={`text-xs font-medium ${color}`}>
      {sign}{delta} {t("points")}
    </span>
  );
}
