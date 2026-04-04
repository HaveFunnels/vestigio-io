"use client";

import type React from "react";
import { Sparkles } from "lucide-react";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function ShinyButton({ children, onClick, className = "", disabled }: ShinyButtonProps) {
  return (
    <button
      className={`shiny-cta ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" />
        {children}
      </span>
    </button>
  );
}
