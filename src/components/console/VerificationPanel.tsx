"use client";

// ──────────────────────────────────────────────
// VerificationPanel — Phase 3 UX Overhaul
//
// Rich panel showing verification lifecycle:
// stepped progress bar, method label, freshness,
// degradation warning, re-trigger CTA, and
// post-correction confirmation.
// ──────────────────────────────────────────────

type VerificationMaturity = "unverified" | "pending" | "partially" | "verified" | "degraded" | "stale";

export interface VerificationPanelProps {
  maturity: string | null;
  method: string; // 'static_only' | 'browser_verified' | 'mixed' | 'unknown'
  verifiedAt?: string | null;
  expiresAt?: string | null;
  confidenceAtVerification?: number | null;
  currentConfidence?: number | null;
  reTriggerReason?: string | null;
  decisionStatus?: string | null;
  onRequestVerification?: () => void;
  onConfirmResolution?: () => void;
}

// ── Step definitions ────────────────────────────

interface StepDef {
  key: VerificationMaturity;
  label: string;
}

const LIFECYCLE_STEPS: StepDef[] = [
  { key: "unverified", label: "Unverified" },
  { key: "pending", label: "Pending" },
  { key: "partially", label: "Partial" },
  { key: "verified", label: "Verified" },
];

const DEGRADED_STEP: StepDef = { key: "degraded", label: "Degraded" };
const STALE_STEP: StepDef = { key: "stale", label: "Stale" };

// ── Helpers ─────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absDiff < 60_000) return isFuture ? "in <1m" : "<1m ago";
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return isFuture ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function freshnessProgress(verifiedAt: string, expiresAt: string): number {
  const start = new Date(verifiedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 0;
  const elapsed = now - start;
  const remaining = Math.max(0, Math.min(1, 1 - elapsed / total));
  return Math.round(remaining * 100);
}

// ── Method label config ─────────────────────────

const methodDisplay: Record<string, { label: string; textColor: string }> = {
  static_only: { label: "Verified via static fetch", textColor: "text-zinc-400" },
  browser_verified: { label: "Verified via browser verification", textColor: "text-emerald-400" },
  mixed: { label: "Mixed verification", textColor: "text-amber-400" },
  unknown: { label: "Verification method unknown", textColor: "text-zinc-500" },
};

// ── Component ───────────────────────────────────

export default function VerificationPanel({
  maturity,
  method,
  verifiedAt,
  expiresAt,
  confidenceAtVerification,
  currentConfidence,
  reTriggerReason,
  decisionStatus,
  onRequestVerification,
  onConfirmResolution,
}: VerificationPanelProps) {
  const mat = (maturity || "unverified") as VerificationMaturity;

  // Build step list: always show the 4 core steps.
  // If degraded or stale, append those steps.
  const steps: StepDef[] = [...LIFECYCLE_STEPS];
  if (mat === "degraded" || mat === "stale") {
    steps.push(DEGRADED_STEP);
  }
  if (mat === "stale") {
    steps.push(STALE_STEP);
  }

  const currentStepIndex = steps.findIndex((s) => s.key === mat);

  const confidenceGap =
    confidenceAtVerification != null && currentConfidence != null
      ? confidenceAtVerification - currentConfidence
      : null;

  const showDegradationWarning = mat === "degraded" || mat === "stale";
  const showReTrigger = showDegradationWarning || !!reTriggerReason;
  const showPostCorrection = decisionStatus === "resolved";

  const methodCfg = methodDisplay[method] || methodDisplay.unknown;

  return (
    <div className="space-y-3">
      {/* ── 1. Stepped Progress Bar ── */}
      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="flex items-center">
          {steps.map((step, i) => {
            const isPast = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;
            const isFuture = i > currentStepIndex;

            // Color logic
            let circleClass: string;
            let labelClass: string;
            let lineClass: string;

            if (step.key === "stale") {
              circleClass = isCurrent
                ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40"
                : "bg-zinc-800/50 text-zinc-600";
              labelClass = isCurrent ? "text-red-400 font-semibold" : "text-zinc-600";
              lineClass = "bg-red-500/30";
            } else if (step.key === "degraded") {
              circleClass = isCurrent
                ? "bg-orange-500/20 text-orange-400 ring-2 ring-orange-500/40"
                : isPast
                  ? "bg-zinc-700 text-zinc-300"
                  : "bg-zinc-800/50 text-zinc-600";
              labelClass = isCurrent ? "text-orange-400 font-semibold" : isPast ? "text-zinc-400" : "text-zinc-600";
              lineClass = isPast ? "bg-orange-500/40" : "bg-zinc-800";
            } else if (isCurrent) {
              circleClass = "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40";
              labelClass = "text-emerald-400 font-semibold";
              lineClass = "bg-zinc-800";
            } else if (isPast) {
              circleClass = "bg-emerald-500/20 text-emerald-400";
              labelClass = "text-zinc-400";
              lineClass = "bg-emerald-500/40";
            } else {
              circleClass = "bg-zinc-800/50 text-zinc-600";
              labelClass = "text-zinc-600";
              lineClass = "bg-zinc-800";
            }

            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${circleClass}`}
                  >
                    {isPast ? "\u2713" : isCurrent ? "\u25CF" : i + 1}
                  </div>
                  <span className={`mt-1.5 whitespace-nowrap text-[10px] leading-tight ${labelClass}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-1.5 h-0.5 w-6 ${isPast ? lineClass : "bg-zinc-800"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── 2. Method Label ── */}
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <span className={`text-xs ${methodCfg.textColor}`}>{methodCfg.label}</span>
        </div>
      </div>

      {/* ── 3. Freshness Indicator ── */}
      {verifiedAt && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Verified {relativeTime(verifiedAt)}
            </span>
            {expiresAt && (
              <span className="text-xs text-zinc-500">
                Expires {relativeTime(expiresAt)}
              </span>
            )}
          </div>
          {expiresAt && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${freshnessProgress(verifiedAt, expiresAt)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 4. Degradation Warning ── */}
      {showDegradationWarning && (
        <div
          className={`rounded-md border px-4 py-3 ${
            mat === "stale"
              ? "border-red-900/50 bg-red-500/5"
              : "border-orange-900/50 bg-orange-500/5"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${mat === "stale" ? "text-red-400" : "text-orange-400"}`}>
              {mat === "stale" ? "Verification Stale" : "Verification Degraded"}
            </span>
          </div>
          {confidenceGap != null && confidenceGap > 0 ? (
            <p className={`text-xs ${mat === "stale" ? "text-red-300/80" : "text-orange-300/80"}`}>
              Confidence dropped {confidenceGap} points since verification
              {confidenceAtVerification != null && currentConfidence != null && (
                <span className="text-zinc-500">
                  {" "}({confidenceAtVerification}% &rarr; {currentConfidence}%)
                </span>
              )}
            </p>
          ) : (
            <p className={`text-xs ${mat === "stale" ? "text-red-300/80" : "text-orange-300/80"}`}>
              {mat === "stale"
                ? "Verification data has expired and needs to be refreshed."
                : "Verification is aging and may no longer reflect current state."}
            </p>
          )}
        </div>
      )}

      {/* ── 5. Re-trigger CTA ── */}
      {showReTrigger && onRequestVerification && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          {reTriggerReason && (
            <p className="mb-2 text-xs text-zinc-400">{reTriggerReason}</p>
          )}
          <button
            onClick={onRequestVerification}
            className="w-full rounded-md border border-amber-800/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            Re-verify
          </button>
        </div>
      )}

      {/* ── 6. Post-Correction Confirmation ── */}
      {showPostCorrection && (
        <div className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-emerald-400">Issue marked as resolved</span>
          </div>
          {onConfirmResolution && (
            <button
              onClick={onConfirmResolution}
              className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              Confirm Resolution
            </button>
          )}
        </div>
      )}
    </div>
  );
}
