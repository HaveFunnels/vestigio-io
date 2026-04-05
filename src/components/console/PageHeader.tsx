"use client";

import { useState } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  tooltip?: string;
}

export default function PageHeader({ title, subtitle, tooltip }: PageHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-content">{title}</h1>
        {tooltip && (
          <span className="relative inline-flex">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip((v) => !v)}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-edge text-[10px] font-bold text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
              aria-label="Page info"
            >
              ?
            </button>
            {showTooltip && (
              <div className="absolute left-8 top-0 z-50 w-72 rounded-lg border border-edge bg-surface-card px-3.5 py-2.5 text-xs leading-relaxed text-content-secondary shadow-xl">
                {tooltip}
              </div>
            )}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-content-muted">{subtitle}</p>
      )}
    </div>
  );
}
