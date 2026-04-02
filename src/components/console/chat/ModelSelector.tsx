"use client";

/**
 * ModelSelector — Compact pill for choosing Default vs Ultra.
 * Ultra is gated by Pro+ plan. Shows cost indicator.
 */

import { useState, useRef, useEffect } from "react";
import type { ModelId } from "@/lib/chat-types";
import { MODELS } from "@/lib/chat-types";

interface ModelSelectorProps {
  selected: ModelId;
  onSelect: (model: ModelId) => void;
  plan: string;
}

export function ModelSelector({ selected, onSelect, plan }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const model = MODELS[selected];
  const canUseUltra = plan === "pro" || plan === "max";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
          selected === "opus_4_6"
            ? "border-purple-700/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
            : "border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400"
        }`}
      >
        {model.label}
        <svg
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-48 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {(Object.values(MODELS) as Array<(typeof MODELS)[ModelId]>).map((m) => {
            const isDisabled = m.id === "opus_4_6" && !canUseUltra;
            const isSelected = selected === m.id;

            return (
              <button
                key={m.id}
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect(m.id);
                    setOpen(false);
                  }
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                  isDisabled
                    ? "cursor-not-allowed opacity-40"
                    : isSelected
                      ? "bg-zinc-800"
                      : "hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200">
                      {m.label}
                    </span>
                    {m.queryCost > 1 && (
                      <span className="rounded border border-amber-700/30 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-400">
                        {m.queryCost}x
                      </span>
                    )}
                    {isDisabled && (
                      <span className="rounded border border-zinc-700 px-1 py-0 text-[9px] text-zinc-500">
                        Pro+
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {m.description}
                  </p>
                </div>

                {isSelected && (
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" viewBox="0 0 16 16" fill="none">
                    <path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
