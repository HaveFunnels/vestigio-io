"use client";

import { useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────
// Admin Feedback — grouped view modeled after error tracking
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface Feedback {
  id: string;
  userId: string | null;
  userEmail: string;
  type: string;
  rating: number | null;
  content: string;
  page: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackResponse {
  feedbacks: Feedback[];
  total: number;
}

/* ---------- Constants ---------- */

const TYPES = ["bug", "feature", "ux", "performance", "general"] as const;

const TYPE_COLORS: Record<string, string> = {
  bug: "bg-red-500/10 text-red-400 border-red-500/20",
  feature: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  ux: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  performance: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  general: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const TYPE_BG_COLORS: Record<string, string> = {
  bug: "bg-red-500/10",
  feature: "bg-violet-500/10",
  ux: "bg-blue-500/10",
  performance: "bg-amber-500/10",
  general: "bg-zinc-500/10",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  reviewed: "bg-amber-500/10 text-amber-400",
  acknowledged: "bg-emerald-500/10 text-emerald-400",
  actioned: "bg-emerald-500/10 text-emerald-400",
  dismissed: "bg-zinc-500/10 text-zinc-400",
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

const FEEDBACK_STATUSES = ["new", "reviewed", "acknowledged", "actioned", "dismissed"];

/* ---------- Helpers ---------- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- Icons ---------- */

const icons = {
  chevronDown: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  bug: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135c-.037-.84-.212-1.555-.694-2.044-.472-.478-1.155-.616-1.986-.064a9.379 9.379 0 00-4.375 7.053m0 0a9.379 9.379 0 00-4.375-7.053c-.831-.552-1.514-.414-1.986.064-.482.489-.657 1.204-.694 2.044a23.91 23.91 0 01-1.152 6.135C7.353 13.258 10.117 12.75 12 12.75z" />
    </svg>
  ),
  lightbulb: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  eye: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  bolt: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  chatBubble: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  star: (filled: boolean) => (
    <svg
      className={`h-3.5 w-3.5 ${filled ? "fill-amber-400 text-amber-400" : "fill-none text-content-faint"}`}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  ),
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bug: icons.bug,
  feature: icons.lightbulb,
  ux: icons.eye,
  performance: icons.bolt,
  general: icons.chatBubble,
};

/* ---------- Skeletons ---------- */

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-7 w-24 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

function SkeletonGroupRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-edge">
      <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-5 w-12 animate-pulse rounded bg-white/[0.06]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-56 animate-pulse rounded bg-white/[0.06]" />
      </div>
      <div className="h-5 w-20 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <tr>
      <td className="px-5 py-3"><div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-8 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-48 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
    </tr>
  );
}

/* ---------- Star Rating ---------- */

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-content-faint">--</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i}>{icons.star(i < rating)}</span>
      ))}
    </div>
  );
}

/* ---------- Grouped view types ---------- */

interface FeedbackGroup {
  type: string;
  feedbacks: Feedback[];
  count: number;
  lastReceived: string;
}

function groupByType(feedbacks: Feedback[]): FeedbackGroup[] {
  const map = new Map<string, Feedback[]>();
  for (const fb of feedbacks) {
    if (!map.has(fb.type)) map.set(fb.type, []);
    map.get(fb.type)!.push(fb);
  }

  const groups: FeedbackGroup[] = [];
  for (const [type, fbs] of map) {
    const sorted = fbs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    groups.push({
      type,
      feedbacks: sorted,
      count: sorted.length,
      lastReceived: sorted[0].createdAt,
    });
  }

  return groups.sort(
    (a, b) => new Date(b.lastReceived).getTime() - new Date(a.lastReceived).getTime()
  );
}

/* ---------- Main Page ---------- */

export default function AdminFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");

  // Grouped view state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);

  // Updating
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/feedback?${params}`);
      if (res.ok) {
        const data: FeedbackResponse = await res.json();
        setFeedbacks(data.feedbacks || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  /* ---------- Actions ---------- */

  async function handleUpdateStatus(feedbackId: string, newStatus: string) {
    setUpdatingId(feedbackId);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, status: newStatus }),
      });
      if (res.ok) {
        setFeedbacks((prev) =>
          prev.map((fb) =>
            fb.id === feedbackId
              ? { ...fb, status: newStatus, updatedAt: new Date().toISOString() }
              : fb
          )
        );
      }
    } catch {
      // silently fail
    } finally {
      setUpdatingId(null);
    }
  }

  /* ---------- Computed ---------- */

  const typeCounts: Record<string, number> = {};
  for (const fb of feedbacks) {
    typeCounts[fb.type] = (typeCounts[fb.type] || 0) + 1;
  }

  const groups = groupByType(feedbacks);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">Feedback</h1>
        <p className="mt-1 text-sm text-content-muted">
          Consolidated user feedback grouped by type. Review, triage, and action on insights from your users.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TYPES.map((type) => (
          <div
            key={type}
            className="rounded-lg border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-card-hover"
          >
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-md ${TYPE_BG_COLORS[type]}`}>
                {TYPE_ICONS[type]}
              </div>
              <span className="text-xs font-medium capitalize text-content-muted">{type}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              {loading ? (
                <div className="h-6 w-10 animate-pulse rounded bg-white/[0.06]" />
              ) : (
                <span className="text-xl font-bold text-content">{typeCounts[type] || 0}</span>
              )}
              <span className="text-[10px] text-content-faint">items</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar + view mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status tabs */}
        <div className="flex rounded-lg border border-edge bg-surface-card p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-accent/20 text-accent-text"
                  : "text-content-muted hover:text-content"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-edge bg-surface-card p-0.5">
          <button
            onClick={() => setViewMode("grouped")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "grouped"
                ? "bg-accent/20 text-accent-text"
                : "text-content-muted hover:text-content"
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "list"
                ? "bg-accent/20 text-accent-text"
                : "text-content-muted hover:text-content"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* ── GROUPED VIEW ── */}
      {viewMode === "grouped" && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-3">
            <div className="flex items-center gap-4 text-[10px] font-medium uppercase tracking-wider text-content-muted">
              <span className="w-5" />
              <span className="w-14">Count</span>
              <span className="flex-1">Type</span>
              <span className="w-24 text-right">Last Received</span>
            </div>
          </div>

          {loading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonGroupRow key={i} />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-content-faint">
              No feedback found for this filter.
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {groups.map((group) => (
                <div key={group.type}>
                  {/* Group header */}
                  <div
                    className="flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-card-hover"
                    onClick={() =>
                      setExpandedGroup(
                        expandedGroup === group.type ? null : group.type
                      )
                    }
                  >
                    <span className="w-5 shrink-0 text-content-faint">
                      {expandedGroup === group.type
                        ? icons.chevronDown
                        : icons.chevronRight}
                    </span>

                    <span className="w-14 shrink-0">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold tabular-nums ${TYPE_COLORS[group.type]?.split(" ").slice(0, 2).join(" ") || "bg-surface-inset text-content-muted"}`}>
                        {group.count}
                      </span>
                    </span>

                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded ${TYPE_BG_COLORS[group.type]}`}>
                        {TYPE_ICONS[group.type]}
                      </div>
                      <span className="text-sm font-medium capitalize text-content">
                        {group.type}
                      </span>
                    </div>

                    <span className="w-24 shrink-0 text-right text-xs text-content-faint">
                      {timeAgo(group.lastReceived)}
                    </span>
                  </div>

                  {/* Expanded: individual feedbacks */}
                  {expandedGroup === group.type && (
                    <div className="border-t border-edge bg-surface-inset/30">
                      <div className="px-5 py-2 text-[10px] font-medium uppercase tracking-wider text-content-muted">
                        {group.count} feedback item{group.count !== 1 ? "s" : ""}
                      </div>
                      <div className="divide-y divide-edge/50">
                        {group.feedbacks.map((fb) => (
                          <div key={fb.id}>
                            <div
                              className="flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-card-hover/50"
                              onClick={() =>
                                setExpandedFeedbackId(
                                  expandedFeedbackId === fb.id ? null : fb.id
                                )
                              }
                            >
                              <span className="shrink-0 text-xs text-content-secondary">
                                {fb.userEmail}
                              </span>

                              <div className="shrink-0">
                                <StarRating rating={fb.rating} />
                              </div>

                              <span className="min-w-0 flex-1 truncate text-xs text-content">
                                {fb.content}
                              </span>

                              {fb.page && (
                                <span className="shrink-0 rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[10px] text-content-faint">
                                  {fb.page}
                                </span>
                              )}

                              <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[fb.status] || STATUS_COLORS.new}`}>
                                {formatStatus(fb.status)}
                              </span>

                              <span className="shrink-0 text-[10px] text-content-faint">
                                {timeAgo(fb.createdAt)}
                              </span>
                            </div>

                            {/* Expanded detail */}
                            {expandedFeedbackId === fb.id && (
                              <div className="border-t border-edge/50 px-5 py-3 text-xs">
                                <div className="space-y-2">
                                  <p className="whitespace-pre-wrap leading-relaxed text-content">
                                    {fb.content}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-content-faint">
                                    <span>User: {fb.userEmail}</span>
                                    {fb.page && <span>Page: <code className="font-mono">{fb.page}</code></span>}
                                    {fb.rating != null && <span>Rating: {fb.rating}/5</span>}
                                    <span>Submitted: {timeAgo(fb.createdAt)}</span>
                                  </div>
                                  <div className="flex items-center gap-2 pt-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
                                      Set Status:
                                    </span>
                                    {FEEDBACK_STATUSES.map((s) => (
                                      <button
                                        key={s}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdateStatus(fb.id, s);
                                        }}
                                        disabled={updatingId === fb.id}
                                        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                          fb.status === s
                                            ? STATUS_COLORS[s]
                                            : "text-content-faint hover:bg-surface-inset hover:text-content-muted"
                                        } disabled:opacity-50`}
                                      >
                                        {formatStatus(s)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">All Feedback</h2>
            {!loading && (
              <span className="text-xs text-content-faint">{total} total</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">User</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Type</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Rating</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Content</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Page</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Status</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Created</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonTableRow key={i} />)
                ) : feedbacks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-content-faint">
                      No feedback found for this filter.
                    </td>
                  </tr>
                ) : (
                  feedbacks.map((fb) => (
                    <tr key={fb.id} className="hover:bg-surface-card-hover">
                      <td className="px-5 py-3 text-sm text-content-secondary">
                        {fb.userEmail}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${TYPE_COLORS[fb.type] || TYPE_COLORS.general}`}>
                          {fb.type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StarRating rating={fb.rating} />
                      </td>
                      <td className="max-w-[300px] truncate px-5 py-3 text-sm text-content">
                        {fb.content}
                      </td>
                      <td className="px-5 py-3">
                        {fb.page ? (
                          <span className="rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[10px] text-content-faint">
                            {fb.page}
                          </span>
                        ) : (
                          <span className="text-xs text-content-faint">--</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[fb.status] || STATUS_COLORS.new}`}>
                          {formatStatus(fb.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-content-faint">
                        {timeAgo(fb.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={fb.status}
                          onChange={(e) => handleUpdateStatus(fb.id, e.target.value)}
                          disabled={updatingId === fb.id}
                          className="rounded-lg border border-edge bg-surface-inset px-2 py-1 text-xs text-content outline-none focus:border-accent/40 disabled:opacity-50"
                        >
                          {FEEDBACK_STATUSES.map((s) => (
                            <option key={s} value={s}>{formatStatus(s)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
