"use client";

import Link from "next/link";
import type { DataState } from "@/lib/console-data";

// ──────────────────────────────────────────────
// Console State — renders loading/empty/error/not_ready
// Every console page wraps its content with this.
// ──────────────────────────────────────────────

interface ConsoleStateProps<T> {
  state: DataState<T>;
  children: (data: T) => React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
}

export default function ConsoleState<T>({
  state,
  children,
  loadingLabel = "Loading analysis...",
  emptyLabel = "No data found.",
}: ConsoleStateProps<T>) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-edge-subtle border-t-emerald-500" />
        <p className="text-sm text-content-muted">{loadingLabel}</p>
      </div>
    );
  }

  if (state.status === "not_ready") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-content-faint">&#9683;</div>
        <h2 className="text-lg font-semibold text-content-secondary">Not Ready</h2>
        <p className="mt-1 max-w-md text-sm text-content-faint">{state.reason}</p>
        <Link
          href="/app/onboarding"
          className="mt-4 rounded-md bg-accent-cta px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-cta-hover"
        >
          Complete Setup
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-red-500">&#9888;</div>
        <h2 className="text-lg font-semibold text-content-secondary">Error Loading Data</h2>
        <p className="mt-1 max-w-md text-sm text-content-faint">{state.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-edge-subtle px-4 py-2 text-sm text-content-tertiary transition-colors hover:bg-surface-card-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.status === "saas_setup_required") {
    const { checklist } = state;
    const completedCount = checklist.checklist_items.filter(i => i.completed).length;
    const totalCount = checklist.checklist_items.length;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-amber-500">&#128274;</div>
        <h2 className="text-lg font-semibold text-content-secondary">SaaS Analysis Not Ready</h2>
        <p className="mt-1 max-w-md text-sm text-content-faint">
          {checklist.setup_summary.split('\n')[0]}
        </p>
        <div className="mt-4 w-full max-w-sm text-left">
          <p className="mb-2 text-xs font-medium text-content-muted">
            Setup Progress ({completedCount}/{totalCount})
          </p>
          {checklist.checklist_items.map((item) => (
            <div
              key={item.key}
              className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${
                item.completed ? "text-emerald-400" : item.blocking ? "text-red-400" : "text-content-faint"
              }`}
            >
              <span>{item.completed ? "\u2713" : item.blocking ? "\u2717" : "\u25CB"}</span>
              <span>{item.label}</span>
              {item.blocking && !item.completed && (
                <span className="ml-auto text-[10px] font-medium uppercase text-red-500">Required</span>
              )}
            </div>
          ))}
        </div>
        <Link
          href="/app/settings/data-sources"
          className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Configure in Data Sources
        </Link>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-content-faint">&#8709;</div>
        <h2 className="text-lg font-semibold text-content-secondary">No Data Yet</h2>
        <p className="mt-1 max-w-md text-sm text-content-faint">{emptyLabel}</p>
      </div>
    );
  }

  return <>{children(state.data)}</>;
}
