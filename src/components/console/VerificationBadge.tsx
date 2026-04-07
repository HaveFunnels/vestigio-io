"use client";

/**
 * VerificationBadge — UI badge that communicates the verification stage
 * of a finding or action. Wave 2.4 reframed the language so that browser
 * verification reads as an enrichment layer on top of static evidence,
 * not as a check on whether the finding is real.
 *
 * The string union mirrors `VerificationStage` from packages/projections/types.ts.
 */

import { useTranslations } from "next-intl";

type VerificationStage =
  | 'static_evidence'
  | 'confirming'
  | 'partial_confirmation'
  | 'confirmed'
  | 'evidence_weakened'
  | 'confirmation_expired';

const config: Record<VerificationStage, { i18nKey: string; style: string; icon: string }> = {
  static_evidence: {
    i18nKey: "static_evidence",
    // Neutral grey — this is real evidence, not a problem state
    style: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
    icon: "\u25CF", // filled circle — substantive
  },
  confirming: {
    i18nKey: "confirming",
    style: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20",
    icon: "\u23F3", // hourglass
  },
  partial_confirmation: {
    i18nKey: "partial_confirmation",
    style: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: "\u25D1", // half circle
  },
  confirmed: {
    i18nKey: "confirmed",
    style: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    icon: "\u2713", // check
  },
  evidence_weakened: {
    i18nKey: "evidence_weakened",
    style: "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/20",
    icon: "\u25BC", // down triangle
  },
  confirmation_expired: {
    i18nKey: "confirmation_expired",
    // Subdued grey with dashed border to suggest "needs re-check" without alarm
    style: "bg-zinc-500/5 text-zinc-500 dark:text-zinc-500 border-dashed border-zinc-500/30",
    icon: "\u29B5", // circle with horizontal bar — paused
  },
};

export default function VerificationBadge({
  value,
  className,
}: {
  value: VerificationStage | null;
  className?: string;
}) {
  const t = useTranslations("console.verification_badge");

  if (!value) return null;

  const c = config[value];
  if (!c) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${c.style} ${className || ""}`}
    >
      <span aria-hidden="true">{c.icon}</span>
      {t(c.i18nKey)}
    </span>
  );
}
