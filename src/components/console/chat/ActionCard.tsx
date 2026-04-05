"use client";

/**
 * ActionCard — Inline action preview in chat messages.
 * Shows priority, title, impact, cross-pack indicator.
 */

import type { ActionCardBlock } from "@/lib/chat-types";

interface ActionCardProps {
  block: ActionCardBlock;
  onNavigate?: (href: string) => void;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function ActionCard({ block, onNavigate }: ActionCardProps) {
  const { action } = block;

  return (
    <button
      onClick={() => onNavigate?.(`/app/actions?action=${action.id}`)}
      className="my-1.5 flex w-full items-center gap-3 rounded-lg border border-emerald-800/20 bg-emerald-500/5 px-3.5 py-2.5 text-left transition-colors hover:border-emerald-700/30 hover:bg-emerald-500/10"
    >
      {/* Priority number */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-700/30 bg-emerald-500/10">
        <span className="font-mono text-[10px] font-bold text-emerald-400">
          {action.priority_score}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-emerald-300">{action.title}</p>
        <div className="mt-1 flex items-center gap-2">
          {action.cross_pack && (
            <span className="rounded border border-emerald-700/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-500">
              cross-pack
            </span>
          )}
          <span className="text-[10px] text-content-muted">
            saves {formatCurrency(action.impact_mid)}/mo
          </span>
        </div>
      </div>

      {/* Arrow */}
      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-700" viewBox="0 0 16 16" fill="none">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
