"use client";

// ──────────────────────────────────────────────
// Prompt Gate Card — inline prompt quality card
//
// Shown when prompt gate detects a weak/misfire.
// User can: send suggested rewrite OR send original.
// NEVER blocks the user completely.
// ──────────────────────────────────────────────

interface PromptGateCardProps {
  quality: 'weak' | 'misfire';
  reason: string;
  suggestedRewrite?: string;
  onSendSuggested: () => void;
  onSendOriginal: () => void;
  onDismiss: () => void;
}

export default function PromptGateCard({
  quality,
  reason,
  suggestedRewrite,
  onSendSuggested,
  onSendOriginal,
  onDismiss,
}: PromptGateCardProps) {
  const isMisfire = quality === 'misfire';

  return (
    <div className="mx-auto max-w-3xl animate-in slide-in-from-bottom-2 duration-200">
      <div className={`rounded-lg border px-4 py-3 ${
        isMisfire
          ? "border-zinc-700 bg-zinc-800/50"
          : "border-amber-800/30 bg-amber-500/5"
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className={`h-4 w-4 ${isMisfire ? "text-zinc-500" : "text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className={`text-xs font-medium ${isMisfire ? "text-zinc-400" : "text-amber-400"}`}>
              {isMisfire ? "Did you mean to send this?" : "This question could be more useful"}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="rounded p-0.5 text-zinc-600 hover:text-zinc-400"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Reason */}
        <p className="mt-1.5 text-xs text-zinc-400">{reason}</p>

        {/* Suggested rewrite */}
        {suggestedRewrite && (
          <div className="mt-2 rounded-md border border-emerald-800/30 bg-emerald-500/5 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">Suggested</div>
            <p className="mt-0.5 text-sm text-emerald-300">{suggestedRewrite}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-2.5 flex items-center gap-2">
          {suggestedRewrite && (
            <button
              onClick={onSendSuggested}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Send suggested
            </button>
          )}
          <button
            onClick={onSendOriginal}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            Send original anyway
          </button>
        </div>
      </div>
    </div>
  );
}
