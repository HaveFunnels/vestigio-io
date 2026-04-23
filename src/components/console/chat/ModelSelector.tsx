"use client";

/**
 * ModelSelector — Compact pill for choosing Default vs Ultra.
 * Ultra is gated by Pro+ plan. Shows cost indicator.
 * Dropdown renders with fixed positioning + z-50 to escape overflow:hidden parents.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ModelId } from "@/lib/chat-types";
import { MODELS } from "@/lib/chat-types";

interface ModelSelectorProps {
  selected: ModelId;
  onSelect: (model: ModelId) => void;
  plan: string;
}

export function ModelSelector({ selected, onSelect, plan }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const model = MODELS[selected];
  const canUseUltra = plan === "pro" || plan === "max";

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.top - 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
          selected === "opus_4_6"
            ? "border-purple-700/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
            : "border-edge/50 bg-surface-inset text-content-muted hover:border-edge hover:text-content-secondary"
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

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[60] w-48 rounded-lg border border-edge bg-surface-card py-1 shadow-xl"
          style={{ top: pos.top, left: pos.left, transform: "translateY(-100%)" }}
        >
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
                      ? "bg-surface-inset"
                      : "hover:bg-surface-inset"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-content-secondary">
                      {m.label}
                    </span>
                    {m.queryCost > 1 && (
                      <span className="rounded border border-amber-700/30 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-400">
                        {m.queryCost}x
                      </span>
                    )}
                    {isDisabled && (
                      <span className="rounded border border-edge px-1 py-0 text-[9px] text-content-muted">
                        Pro+
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-content-muted">
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
        </div>,
        document.body,
      )}
    </>
  );
}
