"use client";

// ──────────────────────────────────────────────
// VerificationSufficiencyWarning → Verification CTA
//
// Actionable button inside the Verification card that opens
// the chat panel and starts verification.
// Uses ShinyButton variant="console" to match "Discutir essa descoberta".
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";
import { ShinyButton } from "@/components/ui/shiny-button";

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
    <div className="px-4 pt-3">
      <ShinyButton variant="console" onClick={onVerify} className="w-full">
        {t("verify_cta")}
      </ShinyButton>
    </div>
  );
}
