"use client";

// ──────────────────────────────────────────────
// VerificationSufficiencyWarning — Phase 3 UX
//
// Inline warning when verification maturity is
// insufficient for the finding/action severity.
// ──────────────────────────────────────────────

export interface VerificationSufficiencyWarningProps {
  severity: string;
  maturity: string | null;
}

const INSUFFICIENT_MATURITIES = new Set(["unverified", "stale", null]);
const HIGH_SEVERITIES = new Set(["high", "critical"]);

export default function VerificationSufficiencyWarning({
  severity,
  maturity,
}: VerificationSufficiencyWarningProps) {
  if (!HIGH_SEVERITIES.has(severity)) return null;
  if (!INSUFFICIENT_MATURITIES.has(maturity)) return null;

  return (
    <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-amber-500 text-xs">&#9888;</span>
        <p className="text-xs text-amber-300/90">
          This {severity === "critical" ? "critical" : "high"}-severity finding&apos;s verification is insufficient.
          Consider requesting verification to strengthen confidence before acting on it.
        </p>
      </div>
    </div>
  );
}
