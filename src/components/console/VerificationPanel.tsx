"use client";

// ──────────────────────────────────────────────
// VerificationPanel
//
// Rich panel showing where a finding sits in the verification lifecycle:
// stepped progress bar, method label, freshness indicator, re-trigger
// CTA, and post-correction confirmation.
//
// Wave 2.4 reframe — the lifecycle now reads as an enrichment progression
// (static_evidence → confirming → confirmed) instead of a "is this real?"
// check. Numeric confidence is no longer rendered anywhere on the panel
// because it leaked engine-internal state into a customer-facing surface.
// Verification stage IS the qualitative signal the user needs.
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";

type VerificationStage =
  | "static_evidence"
  | "confirming"
  | "partial_confirmation"
  | "confirmed"
  | "evidence_weakened"
  | "confirmation_expired";

export interface VerificationPanelProps {
  /** Verification stage from the projection layer. Null = not applicable. */
  maturity: string | null;
  /** How the supporting evidence was collected.
   *  'static_only' | 'browser_verified' | 'mixed' | 'unknown' */
  method: string;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  reTriggerReason?: string | null;
  decisionStatus?: string | null;
  onRequestVerification?: () => void;
  onConfirmResolution?: () => void;
}

// ── Step definitions ────────────────────────────

interface StepDef {
  key: VerificationStage;
  i18nKey: string;
}

// The "happy path" the lifecycle progresses through. Off-path stages
// (evidence_weakened, confirmation_expired) are appended only when the
// finding is currently in one of them.
const LIFECYCLE_STEPS: StepDef[] = [
  { key: "static_evidence", i18nKey: "static_evidence" },
  { key: "confirming", i18nKey: "confirming" },
  { key: "partial_confirmation", i18nKey: "partial_confirmation" },
  { key: "confirmed", i18nKey: "confirmed" },
];

const EVIDENCE_WEAKENED_STEP: StepDef = { key: "evidence_weakened", i18nKey: "evidence_weakened" };
const CONFIRMATION_EXPIRED_STEP: StepDef = { key: "confirmation_expired", i18nKey: "confirmation_expired" };

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

// ── Component ───────────────────────────────────

export default function VerificationPanel({
  maturity,
  method,
  verifiedAt,
  expiresAt,
  reTriggerReason,
  decisionStatus,
  onRequestVerification,
  onConfirmResolution,
}: VerificationPanelProps) {
  const t = useTranslations("console.verification_panel");
  const tb = useTranslations("console.verification_badge");

  const mat = (maturity || "static_evidence") as VerificationStage;

  // Build step list: always show the 4 happy-path steps. Append off-path
  // steps only when the finding is in one of them.
  const steps: StepDef[] = [...LIFECYCLE_STEPS];
  if (mat === "evidence_weakened" || mat === "confirmation_expired") {
    steps.push(EVIDENCE_WEAKENED_STEP);
  }
  if (mat === "confirmation_expired") {
    steps.push(CONFIRMATION_EXPIRED_STEP);
  }

  const currentStepIndex = steps.findIndex((s) => s.key === mat);

  const showRecheckPrompt = mat === "evidence_weakened" || mat === "confirmation_expired";
  const showReTrigger = showRecheckPrompt || !!reTriggerReason;
  const showPostCorrection = decisionStatus === "resolved";

  return (
    <div className="space-y-3">
      {/* ── 1. Stepped Progress Bar ── */}
      <div className="rounded-md border border-edge bg-surface-card px-4 py-3">
        <div className="flex items-center">
          {steps.map((step, i) => {
            const isPast = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;

            // Color logic — semantically:
            //  static_evidence is a NEUTRAL starting state, not a problem
            //  confirmed is the GOOD end state
            //  evidence_weakened / confirmation_expired are side-channel concerns
            let circleClass: string;
            let labelClass: string;
            let lineClass: string;

            if (step.key === "confirmation_expired") {
              circleClass = isCurrent
                ? "bg-zinc-500/20 text-zinc-500 dark:text-zinc-400 ring-2 ring-zinc-500/40"
                : "bg-surface-inset text-content-faint";
              labelClass = isCurrent ? "text-zinc-500 dark:text-zinc-400 font-semibold" : "text-content-faint";
              lineClass = "bg-zinc-500/30";
            } else if (step.key === "evidence_weakened") {
              circleClass = isCurrent
                ? "bg-orange-500/20 text-orange-500 dark:text-orange-400 ring-2 ring-orange-500/40"
                : isPast
                  ? "bg-surface-card-hover text-content-secondary"
                  : "bg-surface-inset text-content-faint";
              labelClass = isCurrent
                ? "text-orange-500 dark:text-orange-400 font-semibold"
                : isPast
                  ? "text-content-muted"
                  : "text-content-faint";
              lineClass = isPast ? "bg-orange-500/40" : "bg-surface-inset";
            } else if (isCurrent) {
              circleClass = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/40";
              labelClass = "text-emerald-600 dark:text-emerald-400 font-semibold";
              lineClass = "bg-surface-inset";
            } else if (isPast) {
              circleClass = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
              labelClass = "text-content-muted";
              lineClass = "bg-emerald-500/40";
            } else {
              circleClass = "bg-surface-inset text-content-faint";
              labelClass = "text-content-faint";
              lineClass = "bg-surface-inset";
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
                    {tb(step.i18nKey)}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-1.5 h-0.5 w-6 ${isPast ? lineClass : "bg-surface-inset"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── 2. Method label ── */}
        <div className="mt-3 border-t border-edge pt-2">
          <span className={`text-xs ${method === "browser_verified" ? "text-emerald-600 dark:text-emerald-400" : method === "mixed" ? "text-amber-600 dark:text-amber-400" : "text-content-muted"}`}>
            {t(`method.${method}`)}
          </span>
        </div>
      </div>

      {/* ── 3. Freshness indicator ── */}
      {verifiedAt && (
        <div className="rounded-md border border-edge bg-surface-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-content-muted">
              {t("confirmed_at", { time: relativeTime(verifiedAt) })}
            </span>
            {expiresAt && (
              <span className="text-xs text-content-muted">
                {t("expires_at", { time: relativeTime(expiresAt) })}
              </span>
            )}
          </div>
          {expiresAt && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-surface-inset">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${freshnessProgress(verifiedAt, expiresAt)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 4. Re-check prompt (no confidence number — purely qualitative) ── */}
      {showRecheckPrompt && (
        <div
          className={`rounded-md border px-4 py-3 ${
            mat === "confirmation_expired"
              ? "border-zinc-500/30 bg-zinc-500/5"
              : "border-orange-500/30 bg-orange-500/5"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${
                mat === "confirmation_expired"
                  ? "text-zinc-600 dark:text-zinc-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}
            >
              {mat === "confirmation_expired"
                ? t("recheck.expired_title")
                : t("recheck.weakened_title")}
            </span>
          </div>
          <p
            className={`text-xs ${
              mat === "confirmation_expired"
                ? "text-zinc-600/80 dark:text-zinc-400/80"
                : "text-orange-600/80 dark:text-orange-400/80"
            }`}
          >
            {mat === "confirmation_expired"
              ? t("recheck.expired_body")
              : t("recheck.weakened_body")}
          </p>
        </div>
      )}

      {/* ── 5. Re-trigger CTA ── */}
      {showReTrigger && onRequestVerification && (
        <div className="rounded-md border border-edge bg-surface-card px-4 py-3">
          {reTriggerReason && (
            <p className="mb-2 text-xs text-content-muted">{reTriggerReason}</p>
          )}
          <button
            onClick={onRequestVerification}
            className="w-full rounded-md border border-amber-800/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            {t("recheck.button")}
          </button>
        </div>
      )}

      {/* ── 6. Post-Correction Confirmation ── */}
      {showPostCorrection && (
        <div className="rounded-md border border-emerald-900/50 bg-emerald-500/5 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {t("resolution.title")}
            </span>
          </div>
          {onConfirmResolution && (
            <button
              onClick={onConfirmResolution}
              className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              {t("resolution.button")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
