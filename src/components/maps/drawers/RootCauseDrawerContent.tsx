"use client";

import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import type { MapNode } from "../../../../packages/maps";

export default function RootCauseDrawerContent({ node }: { node: MapNode }) {
  const t = useTranslations("console.maps");
  const category =
    typeof node.metadata.category === "string" ? node.metadata.category : null;
  const reasoning =
    typeof node.metadata.reasoning === "string"
      ? node.metadata.reasoning
      : null;
  const description =
    typeof node.metadata.description === "string"
      ? node.metadata.description
      : null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {t("drawer.rootCauseDetails")}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {category && (
            <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
              {category}
            </span>
          )}
        </div>
      </section>

      {/* Reasoning */}
      {reasoning && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("drawer.reasoning")}
          </h3>
          <p className="text-sm leading-relaxed text-content-muted">
            {reasoning}
          </p>
        </section>
      )}

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
            {t("drawer.aggregateImpact")}
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

      {Array.isArray(node.metadata.affected_packs) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("drawer.affectedPacks")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {(node.metadata.affected_packs as string[]).map((pack) => (
              <span
                key={pack}
                className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted"
              >
                {pack.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
