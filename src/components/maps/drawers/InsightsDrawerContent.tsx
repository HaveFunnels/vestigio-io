"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCopilot } from "@/components/app/CopilotProvider";
import SeverityBadge from "@/components/console/SeverityBadge";
import { formatCurrency } from "../map-utils";
import type { NodeInsights } from "../insights-matcher";
import type {
  FindingProjection,
  ActionProjection,
} from "../../../../packages/projections";

export default function InsightsDrawerContent({
  insights,
  nodeLabel,
}: {
  insights: NodeInsights;
  nodeLabel: string;
}) {
  const t = useTranslations("console.maps.insights");
  const router = useRouter();
  const copilot = useCopilot();

  // Group findings by root cause
  const byRootCause = useMemo(() => {
    const groups = new Map<
      string,
      {
        rootCause: string;
        findings: FindingProjection[];
        actions: ActionProjection[];
      }
    >();
    const ungrouped: {
      finding: FindingProjection;
      actions: ActionProjection[];
    }[] = [];

    for (const item of insights.items) {
      const rc = item.finding.root_cause;
      if (rc) {
        let group = groups.get(rc);
        if (!group) {
          group = { rootCause: rc, findings: [], actions: item.actions };
          groups.set(rc, group);
        }
        group.findings.push(item.finding);
      } else {
        ungrouped.push(item);
      }
    }
    return { grouped: Array.from(groups.values()), ungrouped };
  }, [insights.items]);

  return (
    <div className="space-y-5">
      {/* Summary stat */}
      <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface-inset px-4 py-3">
        <div className="text-2xl font-bold tabular-nums text-content">
          {insights.items.length}
        </div>
        <div className="min-w-0 text-xs text-content-muted">
          <div className="font-medium text-content-secondary">
            {t("finding_count", { count: insights.items.length })}
          </div>
          <div className="mt-0.5 font-mono text-red-600 dark:text-red-400">
            {formatCurrency(insights.totalImpact)}/mo
          </div>
        </div>
      </div>

      {/* Root-cause grouped findings */}
      {byRootCause.grouped.map((group) => (
        <section
          key={group.rootCause}
          className="rounded-lg border border-edge bg-surface-card/50 p-4"
        >
          <div className="mb-3 flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[10px] font-bold text-red-500">
              !
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                {t("root_cause")}
              </div>
              {group.actions[0]?.root_cause_key ? (
                <Link
                  href={`/app/maps/root_cause?focus=${encodeURIComponent(`rc_${group.actions[0].root_cause_key}`)}`}
                  className="mt-0.5 block text-sm font-medium text-content underline decoration-red-500/30 decoration-1 underline-offset-2 transition-colors hover:text-red-500 hover:decoration-red-500/60"
                  title={t("view_in_root_cause_map")}
                >
                  {group.rootCause}
                  <span className="ml-1 inline-block text-[10px] text-content-faint">
                    ↗
                  </span>
                </Link>
              ) : (
                <div className="mt-0.5 text-sm font-medium text-content">
                  {group.rootCause}
                </div>
              )}
            </div>
          </div>

          {/* Findings under this root cause */}
          <div className="space-y-2 border-l-2 border-red-500/20 pl-3">
            {group.findings.map((f) => (
              <div
                key={f.id}
                className="flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs text-content-secondary">
                    {f.title}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-red-600 dark:text-red-400">
                    {formatCurrency(f.impact.midpoint)}/mo
                  </div>
                </div>
                <SeverityBadge value={f.severity} />
              </div>
            ))}
          </div>

          {/* Top action for this root cause */}
          {group.actions.length > 0 && (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {t("recommended_action")}
              </div>
              <div className="mt-0.5 text-xs font-medium text-content">
                {group.actions[0].title}
              </div>
              {group.actions[0].remediation_steps &&
                group.actions[0].remediation_steps.length > 0 && (
                  <ol className="mt-2 list-inside list-decimal space-y-0.5 text-[11px] text-content-muted">
                    {group.actions[0].remediation_steps
                      .slice(0, 3)
                      .map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                  </ol>
                )}
            </div>
          )}
        </section>
      ))}

      {/* Ungrouped findings (no root cause) */}
      {byRootCause.ungrouped.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("other_findings")}
          </div>
          {byRootCause.ungrouped.map((item) => (
            <div
              key={item.finding.id}
              className="flex items-start justify-between gap-2 rounded-md border border-edge px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs text-content-secondary">
                  {item.finding.title}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-red-600 dark:text-red-400">
                  {formatCurrency(item.finding.impact.midpoint)}/mo
                </div>
              </div>
              <SeverityBadge value={item.finding.severity} />
            </div>
          ))}
        </section>
      )}

      {/* Discuss in chat CTA */}
      <button
        type="button"
        onClick={() => {
          const selected = insights.items.map((it) => it.finding);
          if (selected.length === 1) {
            copilot.open({
              finding: selected[0],
              prompt: `Discuss this finding: "${selected[0].title}". What's the impact and what should I do about it?`,
            });
          } else {
            copilot.open({
              prompt: `Analyze these ${selected.length} findings together and identify cross-signal patterns:\n${selected.map((f) => `- ${f.title}`).join("\n")}`,
            });
          }
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-edge bg-surface-card px-4 py-2.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
        {t("discuss_in_chat")}
      </button>
    </div>
  );
}
