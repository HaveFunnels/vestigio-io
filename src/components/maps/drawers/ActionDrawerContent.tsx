"use client";

import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import type { MapNode } from "../../../../packages/maps";

export default function ActionDrawerContent({ node }: { node: MapNode }) {
  const t = useTranslations("console.maps");
  const actionType =
    typeof node.metadata.action_type === "string"
      ? node.metadata.action_type
      : null;
  const description =
    typeof node.metadata.description === "string"
      ? node.metadata.description
      : null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {t("drawer.actionDetails")}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {actionType && (
            <span className="text-xs text-content-muted">
              {actionType.replace(/_/g, " ")}
            </span>
          )}
          {!!node.metadata.cross_pack && (
            <span className="inline-flex rounded border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
              {t("drawer.crossPack")}
            </span>
          )}
        </div>
      </section>

      {/* Description */}
      {description && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("drawer.description")}
          </h3>
          <p className="text-sm leading-relaxed text-content-muted">
            {description}
          </p>
        </section>
      )}

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("drawer.impactUnlocked")}
          </h3>
          <div className="space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">
                {t("drawer.monthlyRange")}
              </span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">
                {t("drawer.midpoint")}
              </span>
              <ImpactBadge
                min={node.impact.midpoint}
                max={node.impact.midpoint}
                compact
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
