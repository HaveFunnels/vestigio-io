"use client";

import type React from "react";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  /**
   * "homepage" — animated conic-gradient border, white bg, dot pattern (for marketing pages)
   * "console"  — clean emerald button matching the dashboard visual language (for /app)
   */
  variant?: "homepage" | "console";
}

export function ShinyButton({
  children,
  onClick,
  className = "",
  disabled,
  variant = "homepage",
}: ShinyButtonProps) {
  if (variant === "console") {
    return (
      <button
        className={`inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 ${className}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      className={`shiny-cta ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
    </button>
  );
}
