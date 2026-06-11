"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { DrawerSection } from "@/components/console/DrawerSection";
import { formatCurrency } from "../map-utils";
import type { MapNode } from "../../../../packages/maps";
import type { FindingProjection } from "../../../../packages/projections";

/** Rich finding drawer — uses full FindingProjection when available (same as /analysis) */
export default function RichFindingDrawer({
  node,
  finding,
}: {
  node: MapNode;
  finding?: FindingProjection | null;
}) {
  const td = useTranslations("console.finding_drawer");
  const tc = useTranslations("console.common");
  const tm = useTranslations("console.maps");
  const router = useRouter();

  if (!finding) {
    // Fallback for nodes without matching finding projection.
    // Uses DrawerSection (alinhado com o resto do drawer) + chip
    // rounded-full pra pack label (convenção de chip+dot).
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.pack && (
            <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-content-muted">
              {node.pack}
            </span>
          )}
        </div>
        {node.impact && (
          <DrawerSection title={tm("drawer.impactBreakdown")} accent="danger">
            <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card px-4 py-2">
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
          </DrawerSection>
        )}
      </div>
    );
  }

  function humanizePackKey(key: string): string {
    return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  function packLabel(key: string): string {
    const k = `pack_labels.${key}`;
    return tc.has(k) ? tc(k) : humanizePackKey(key);
  }
  const impactTypeLabels: Record<string, string> = {
    revenue_loss: tc("impact_types.revenue_loss"),
    conversion_loss: tc("impact_types.conversion_loss"),
    chargeback_risk: tc("impact_types.chargeback_risk"),
    traffic_waste: tc("impact_types.traffic_waste"),
    lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
    none: tc("impact_types.none"),
  };

  return (
    // space-y-6 alinha com Plan's drawer-bodies + FindingDetailPanel.
    // Sections agora usam DrawerSection (mesmo do console) em vez do
    // <h3> ad-hoc — typography uniforme (10px uppercase + accent dot)
    // e o customer reconhece o pattern entre Maps drawer e
    // /app/findings/[id].
    <div className="space-y-6">
      <DrawerSection title={td("summary")}>
        <p className="text-sm text-content-secondary">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SeverityBadge value={finding.severity} />
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && <ChangeBadge value={finding.change_class} />}
          <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-content-muted">
            {packLabel(finding.pack)}
          </span>
        </div>
      </DrawerSection>

      {finding.root_cause && (
        <DrawerSection title={td("root_cause")}>
          <div className="rounded-xl border border-edge bg-surface-card px-4 py-3">
            <span className="text-sm font-medium text-content-secondary">
              {finding.root_cause}
            </span>
          </div>
        </DrawerSection>
      )}

      <DrawerSection title={td("impact_breakdown")} accent="danger">
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card px-4 py-2">
            <span className="text-xs text-content-muted">
              {td("monthly_range")}
            </span>
            <ImpactBadge
              min={finding.impact.monthly_range.min}
              max={finding.impact.monthly_range.max}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card px-4 py-2">
            <span className="text-xs text-content-muted">
              {td("impact_type")}
            </span>
            <span className="text-xs text-content-secondary">
              {impactTypeLabels[finding.impact.impact_type] ||
                finding.impact.impact_type}
            </span>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title={td("verification")}>
        <VerificationPanel
          maturity={finding.verification_maturity}
          method={finding.verification_method}
          verifiedAt={null}
          expiresAt={null}
          reTriggerReason={null}
          decisionStatus={null}
          onRequestVerification={() =>
            router.push(
              `/app/chat?intent=verify&finding=${encodeURIComponent(finding.id)}`,
            )
          }
        />
      </DrawerSection>
      <VerificationSufficiencyWarning
        severity={finding.severity}
        maturity={finding.verification_maturity}
      />

      <DrawerSection title={td("reasoning")}>
        <p className="text-sm leading-relaxed text-content-muted">
          {finding.reasoning}
        </p>
      </DrawerSection>

      {/* Cross-map: View in Journey */}
      {finding.surface && !finding.surface.includes("sitewide") && (
        <Link
          href={`/app/maps/user_journey`}
          className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-400"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 6.75V15m0 0l-4.28-1.427a2.25 2.25 0 01-1.534-2.134V6.75A2.25 2.25 0 015.468 4.645l3.53 1.175 5.998-2 4.282 1.427A2.25 2.25 0 0121 7.38v7.115M9 15l6-2m-6 2v4.5m6-6.5v4.5m0-4.5l3.532 1.175A2.25 2.25 0 0121 16.505V19.5"
            />
          </svg>
          {tm("insights.view_in_journey")}
          <span className="ml-auto font-mono text-[10px] text-content-faint">
            {finding.surface}
          </span>
        </Link>
      )}
    </div>
  );
}
