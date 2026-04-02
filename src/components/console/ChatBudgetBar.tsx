"use client";

// ──────────────────────────────────────────────
// Chat Budget Bar — usage-aware MCP UX
//
// Shows remaining daily budget inline in chat.
// Subtle upsell nudge when approaching thresholds.
// Never punitive, always helpful.
// ──────────────────────────────────────────────

interface ChatBudgetBarProps {
  mcpUsed: number;
  mcpLimit: number;
  mcpRemaining: number;
  mcpPct: number;
  plan: string;
}

export default function ChatBudgetBar({
  mcpUsed,
  mcpLimit,
  mcpRemaining,
  mcpPct,
  plan,
}: ChatBudgetBarProps) {
  const pct = Math.min(100, mcpPct);

  const barColor =
    pct >= 90 ? "bg-red-500" :
    pct >= 70 ? "bg-amber-500" :
    "bg-emerald-500";

  const textColor =
    pct >= 90 ? "text-red-400" :
    pct >= 70 ? "text-amber-400" :
    "text-content-faint";

  return (
    <div className="px-4 py-1.5 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          {/* Mini progress bar */}
          <div className="h-1 flex-1 rounded-full bg-surface-tooltip">
            <div
              className={`h-1 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Label */}
          <span className={`shrink-0 text-[10px] font-medium tabular-nums ${textColor}`}>
            {mcpRemaining}/{mcpLimit} left
          </span>
        </div>

        {/* Threshold nudges */}
        {pct >= 90 && mcpRemaining > 0 && (
          <p className="mt-1 text-[10px] text-amber-400/80">
            {mcpRemaining === 1 ? "Last query today." : `${mcpRemaining} queries left.`}
            {" "}Try a playbook for maximum value.
          </p>
        )}

        {pct >= 70 && pct < 90 && (
          <p className="mt-1 text-[10px] text-content-faint">
            {mcpRemaining} queries remaining. Consider consolidating questions.
          </p>
        )}

        {mcpRemaining === 0 && (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-[10px] text-red-400/80">
              Daily budget used. Resets tomorrow.
            </p>
            {plan !== 'max' && (
              <span className="text-[10px] text-content-faint">
                Upgrade for more daily queries.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
