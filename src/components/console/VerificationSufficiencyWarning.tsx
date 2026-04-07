"use client";

// ──────────────────────────────────────────────
// VerificationSufficiencyWarning
//
// Inline warning shown when a high-severity finding sits at a
// verification stage that benefits from browser corroboration.
//
// Wave 2.4 reframe — the warning no longer says "strengthen confidence"
// (that exposed engine-internal language). It now invites the user to
// run a verification to corroborate the static evidence with a real
// browser run.
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";

export interface VerificationSufficiencyWarningProps {
  severity: string;
  maturity: string | null;
}

// Stages where browser corroboration would strengthen the case for
// acting on a high-severity finding. `static_evidence` qualifies because
// the finding is real but not yet corroborated. `evidence_weakened` /
// `confirmation_expired` qualify because they signal that prior
// confirmation has decayed.
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
}: VerificationSufficiencyWarningProps) {
  const t = useTranslations("console.verification_sufficiency");

  if (!HIGH_SEVERITIES.has(severity)) return null;
  if (!STAGES_BENEFITING_FROM_RECHECK.has(maturity)) return null;

  return (
    <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-amber-500 text-xs" aria-hidden="true">
          &#9888;
        </span>
        <p className="text-xs text-amber-700 dark:text-amber-300/90">
          {severity === "critical" ? t("critical") : t("high")}
        </p>
      </div>
    </div>
  );
}
