"use client";

/**
 * CreateActionCard — Inline card that allows users to save
 * an insight from the conversation as an actionable item.
 * Claude suggests these when discovering correlations or new analysis.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

interface CreateActionCardProps {
  suggestedTitle: string;
  suggestedDescription: string;
  severity: string;
  estimatedImpact?: number;
  onSave: (action: { title: string; description: string; severity: string; estimatedImpact?: number }) => void;
}

export function CreateActionCard({
  suggestedTitle,
  suggestedDescription,
  severity,
  estimatedImpact,
  onSave,
}: CreateActionCardProps) {
  const t = useTranslations("console.chat.create_action");
  const tc = useTranslations("console.common");
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState(suggestedTitle);

  function handleSave() {
    onSave({ title, description: suggestedDescription, severity, estimatedImpact });
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-emerald-800/20 bg-emerald-500/5 px-3.5 py-2.5">
        <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 16 16" fill="none">
          <path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm text-emerald-400">{t("saved", { title })}</span>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-amber-800/20 bg-amber-500/5 px-3.5 py-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-500/10">
          <svg className="h-3 w-3 text-amber-400" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
            {t("suggested")}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-edge bg-surface-card px-2 py-1 text-sm text-content-secondary outline-none focus:border-amber-600"
          />
          <p className="mt-1 text-xs text-content-muted">{suggestedDescription}</p>
          {estimatedImpact != null && (
            <p className="mt-0.5 font-mono text-xs text-amber-400">
              {t("estimated_impact", {
                amount: `$${estimatedImpact.toLocaleString()}`,
                perMonth: tc("per_month_short"),
              })}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          onClick={handleSave}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}
