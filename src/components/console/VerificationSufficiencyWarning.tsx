"use client";

// ──────────────────────────────────────────────
// VerificationSufficiencyWarning → Verification CTA
//
// Replaces the passive "this came from static analysis" warning with
// an actionable button that opens the chat panel and starts verification.
// The old passive text was useless — the user couldn't do anything with it.
// Now they click one button and the copilot takes over.
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";

export interface VerificationSufficiencyWarningProps {
  severity: string;
  maturity: string | null;
  onVerify?: () => void;
}

const STAGES_BENEFITING_FROM_RECHECK = new Set<string | null>([
  "static_evidence",
  "evidence_weakened",
  "confirmation_expired",
  null,
]);

const HIGH_SEVERITIES = new Set(["high", "critical"]);

export default function VerificationSufficiencyWarning({
  severity,
  maturity,
  onVerify,
}: VerificationSufficiencyWarningProps) {
  const t = useTranslations("console.verification_sufficiency");

  if (!HIGH_SEVERITIES.has(severity)) return null;
  if (!STAGES_BENEFITING_FROM_RECHECK.has(maturity)) return null;

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={onVerify}
        className="flex w-full items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
      >
        <ShieldCheckIcon size={20} weight="duotone" className="shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-emerald-300">{t("verify_cta")}</p>
          <p className="mt-0.5 text-xs text-content-muted">{t("verify_cta_sub")}</p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-emerald-400/60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </div>
  );
}
