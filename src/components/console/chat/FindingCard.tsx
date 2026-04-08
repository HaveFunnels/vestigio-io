"use client";

/**
 * FindingCard — Inline finding preview in chat messages.
 * Shows severity, title, impact range, pack, and root cause.
 * Clicking navigates to the Analysis page with the finding selected.
 */

import type { FindingCardBlock } from "@/lib/chat-types";
import { useTranslations } from "next-intl";
import SeverityBadge from "../SeverityBadge";

interface FindingCardProps {
  block: FindingCardBlock;
  onNavigate?: (href: string) => void;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function FindingCard({ block, onNavigate }: FindingCardProps) {
  const tc = useTranslations("console.common");
  const td = useTranslations("console.finding_drawer");
  const { finding } = block;
  const impactColor =
    finding.impact_mid >= 5000
      ? "text-red-400"
      : finding.impact_mid >= 1000
        ? "text-amber-400"
        : "text-content-muted";

  return (
    <button
      onClick={() => onNavigate?.(`/app/analysis?finding=${finding.id}`)}
      className="my-1.5 flex w-full items-start gap-3 rounded-lg border border-edge bg-surface-card/60 px-3.5 py-3 text-left transition-colors hover:border-edge hover:bg-surface-inset/60"
    >
      {/* Severity indicator bar */}
      <div
        className={`mt-0.5 h-8 w-0.5 shrink-0 rounded-full ${
          finding.severity === "critical"
            ? "bg-red-500"
            : finding.severity === "high"
              ? "bg-orange-500"
              : finding.severity === "medium"
                ? "bg-amber-500"
                : "bg-blue-500"
        }`}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-content-secondary">{finding.title}</p>
          <span className={`shrink-0 font-mono text-sm font-bold ${impactColor}`}>
            {formatCurrency(finding.impact_mid)}
            <span className="text-[10px] font-normal text-content-faint">{tc("per_month_short")}</span>
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <SeverityBadge value={finding.severity} />
          <span className="text-[10px] text-content-faint">
            {finding.pack.replace(/_/g, " ")}
          </span>
        </div>

        {finding.root_cause && (
          <p className="mt-1.5 text-xs text-content-muted">
            {td("root_cause")}: {finding.root_cause}
          </p>
        )}
      </div>

      {/* Arrow */}
      <svg className="mt-1 h-3.5 w-3.5 shrink-0 text-content-faint" viewBox="0 0 16 16" fill="none">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
