"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// Organization + Environment Selector
// Appears in console layout header.
// Changes reload MCP context.
// ──────────────────────────────────────────────

interface OrgEnv {
  orgId: string;
  orgName: string;
  envId: string;
  domain: string;
}

interface OrgSelectorProps {
  current: OrgEnv | null;
  organizations?: OrgEnv[];
}

export default function OrgSelector({ current, organizations = [] }: OrgSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!current) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-xs text-content-faint">No organization</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-edge bg-surface-card/50 px-3 py-1.5 text-sm transition-colors hover:border-edge-subtle"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium text-content-secondary">{current.orgName}</span>
        <span className="text-content-faint">|</span>
        <span className="text-content-muted">{current.domain}</span>
        {organizations.length > 1 && (
          <svg className="h-3 w-3 text-content-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && organizations.length > 1 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-edge bg-surface py-1 shadow-xl">
          {organizations.map((org) => (
            <button
              key={`${org.orgId}-${org.envId}`}
              onClick={() => {
                // In production: switch org/env, reload MCP context
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-surface-card-hover ${
                org.orgId === current.orgId && org.envId === current.envId
                  ? "text-accent-text"
                  : "text-content-tertiary"
              }`}
            >
              <span className="font-medium">{org.orgName}</span>
              <span className="text-content-faint">—</span>
              <span className="text-content-muted">{org.domain}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
