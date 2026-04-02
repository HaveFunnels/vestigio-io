"use client";

/**
 * StreamingCursor — Blinking emerald cursor for streaming text.
 */

export function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-emerald-400" />
  );
}
