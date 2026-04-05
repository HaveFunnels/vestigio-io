"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// Playbooks Drawer — Expert Analysis Prompts
//
// Side drawer showing 30+ categorized prompts.
// Each playbook has title + description (prompt hidden).
// Click "Use" to paste prompt into chat input.
// ──────────────────────────────────────────────

interface PlaybookPromptDef {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  min_plan: string;
  tags: string[];
  estimated_queries: number;
}

interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
}

interface PlaybooksDrawerProps {
  open: boolean;
  onClose: () => void;
  onUsePrompt: (prompt: string) => void;
  playbooks: PlaybookPromptDef[];
  categories: Record<string, CategoryMeta>;
  mcpRemaining: number;
  currentPlan: string;
}

const PLAN_RANK: Record<string, number> = { vestigio: 0, pro: 1, max: 2 };

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  red:     { border: 'border-red-800/30',     bg: 'bg-red-500/5',     text: 'text-red-400',     badge: 'bg-red-500/10 text-red-400 border-red-700/30' },
  emerald: { border: 'border-emerald-800/30', bg: 'bg-emerald-500/5', text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/30' },
  amber:   { border: 'border-amber-800/30',   bg: 'bg-amber-500/5',   text: 'text-amber-400',   badge: 'bg-amber-500/10 text-amber-400 border-amber-700/30' },
  blue:    { border: 'border-blue-800/30',    bg: 'bg-blue-500/5',    text: 'text-blue-400',    badge: 'bg-blue-500/10 text-blue-400 border-blue-700/30' },
  violet:  { border: 'border-violet-800/30',  bg: 'bg-violet-500/5',  text: 'text-violet-400',  badge: 'bg-violet-500/10 text-violet-400 border-violet-700/30' },
  orange:  { border: 'border-orange-800/30',  bg: 'bg-orange-500/5',  text: 'text-orange-400',  badge: 'bg-orange-500/10 text-orange-400 border-orange-700/30' },
  cyan:    { border: 'border-cyan-800/30',    bg: 'bg-cyan-500/5',    text: 'text-cyan-400',    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-700/30' },
  rose:    { border: 'border-rose-800/30',    bg: 'bg-rose-500/5',    text: 'text-rose-400',    badge: 'bg-rose-500/10 text-rose-400 border-rose-700/30' },
};

const ICON_PATHS: Record<string, string> = {
  dollar:  "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  funnel:  "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
  shield:  "M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  rocket:  "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  badge:   "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  compare: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  chart:   "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  trophy:  "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228M18.75 4.236V2.721",
};

export default function PlaybooksDrawer({
  open,
  onClose,
  onUsePrompt,
  playbooks,
  categories,
  mcpRemaining,
  currentPlan,
}: PlaybooksDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  const planRank = PLAN_RANK[currentPlan] || 0;
  const categoryKeys = Object.keys(categories);

  // Filter by category + search
  let filtered = selectedCategory
    ? playbooks.filter((p) => p.category === selectedCategory)
    : playbooks;

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="flex w-[420px] flex-col border-l border-edge bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-content">Playbooks</h2>
            <p className="text-[10px] text-content-muted">
              {playbooks.length} expert analysis prompts
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-content-muted hover:bg-surface-card-hover hover:text-content-secondary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-edge px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks..."
            className="w-full rounded-md border border-edge bg-surface-card px-3 py-1.5 text-xs text-content-secondary placeholder-content-faint outline-none focus:border-edge"
          />
        </div>

        {/* Budget indicator */}
        <div className="border-b border-edge px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-muted">Daily budget remaining</span>
            <span className={mcpRemaining <= 3 ? "font-medium text-amber-400" : "text-content-muted"}>
              {mcpRemaining} queries
            </span>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 border-b border-edge px-4 py-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              selectedCategory === null
                ? "bg-surface-card-hover text-content-secondary"
                : "text-content-muted hover:text-content-secondary"
            }`}
          >
            All
          </button>
          {categoryKeys.map((cat) => {
            const meta = categories[cat];
            const colors = COLOR_MAP[meta.color] || COLOR_MAP.emerald;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  cat === selectedCategory
                    ? `${colors.badge} border`
                    : "text-content-muted hover:text-content-secondary"
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Playbook list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-content-faint">
              No playbooks match your search.
            </p>
          )}

          {filtered.map((pb) => {
            const catMeta = categories[pb.category];
            const colors = COLOR_MAP[catMeta?.color || "emerald"] || COLOR_MAP.emerald;
            const planLocked = (PLAN_RANK[pb.min_plan] || 0) > planRank;
            const canAfford = mcpRemaining >= pb.estimated_queries;
            const isExpanded = expandedId === pb.id;

            return (
              <div
                key={pb.id}
                className={`rounded-lg border transition-all ${
                  planLocked
                    ? "cursor-not-allowed border-edge bg-surface-card/20 opacity-50"
                    : `${colors.border} bg-surface-card/40 hover:bg-surface-card/60`
                }`}
              >
                {/* Header — always visible */}
                <button
                  onClick={() => !planLocked && setExpandedId(isExpanded ? null : pb.id)}
                  disabled={planLocked}
                  className="w-full p-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    {/* Category icon */}
                    <div className={`rounded p-1 ${colors.bg}`}>
                      <svg className={`h-3.5 w-3.5 ${colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[catMeta?.icon || "badge"] || ICON_PATHS.badge} />
                      </svg>
                    </div>

                    <h3 className="flex-1 text-sm font-medium text-content-secondary">{pb.title}</h3>

                    {planLocked && (
                      <span className="shrink-0 rounded border border-amber-700/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                        {pb.min_plan === "pro" ? "Pro+" : pb.min_plan === "max" ? "Max" : pb.min_plan}
                      </span>
                    )}

                    {/* Expand chevron */}
                    {!planLocked && (
                      <svg
                        className={`h-3.5 w-3.5 text-content-faint transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 16 16"
                      >
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-content-muted line-clamp-2">{pb.description}</p>

                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${colors.badge}`}>
                      {catMeta?.label || pb.category}
                    </span>
                    <span className={`text-[10px] ${canAfford ? "text-content-faint" : "text-red-400"}`}>
                      ~{pb.estimated_queries} queries
                    </span>
                  </div>
                </button>

                {/* Expanded: show prompt preview + use button */}
                {isExpanded && !planLocked && (
                  <div className="border-t border-edge/50 px-3 pb-3 pt-2">
                    <div className="rounded-md bg-surface-card p-2.5">
                      <p className="text-[11px] leading-relaxed text-content-muted line-clamp-4">
                        {pb.prompt}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onUsePrompt(pb.prompt);
                        onClose();
                      }}
                      disabled={!canAfford}
                      className={`mt-2 w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        canAfford
                          ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                          : "cursor-not-allowed bg-surface-inset text-content-faint"
                      }`}
                    >
                      {canAfford ? "Use this prompt" : "Not enough budget"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {mcpRemaining <= 5 && (
          <div className="border-t border-edge px-4 py-2">
            <p className="text-[10px] text-amber-400/80">
              Budget is low. Choose a playbook carefully for maximum value.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
