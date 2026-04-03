"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin Audit Log — searchable, filterable log
// ──────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
}

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

const ACTION_CATEGORIES: Record<string, { label: string; color: string }> = {
  "org.suspend": { label: "Org Suspend", color: "bg-blue-500/10 text-blue-400" },
  "org.reactivate": { label: "Org Reactivate", color: "bg-blue-500/10 text-blue-400" },
  "org.impersonate": { label: "Org Impersonate", color: "bg-red-500/10 text-red-400" },
  "pricing.update": { label: "Pricing Update", color: "bg-purple-500/10 text-purple-400" },
  "config.update": { label: "Config Update", color: "bg-purple-500/10 text-purple-400" },
  "newsletter.send": { label: "Newsletter Send", color: "bg-blue-500/10 text-blue-400" },
  "user.delete": { label: "User Delete", color: "bg-red-500/10 text-red-400" },
  "user.role_change": { label: "Role Change", color: "bg-red-500/10 text-red-400" },
  "alert.create": { label: "Alert Create", color: "bg-amber-500/10 text-amber-400" },
};

function actionBadge(action: string) {
  const cat = ACTION_CATEGORIES[action];
  if (cat) {
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cat.color}`}>
        {cat.label}
      </span>
    );
  }
  // Fallback: derive color from prefix
  const prefix = action.split(".")[0];
  const colorMap: Record<string, string> = {
    org: "bg-blue-500/10 text-blue-400",
    config: "bg-purple-500/10 text-purple-400",
    pricing: "bg-purple-500/10 text-purple-400",
    user: "bg-red-500/10 text-red-400",
    newsletter: "bg-blue-500/10 text-blue-400",
    alert: "bg-amber-500/10 text-amber-400",
  };
  const color = colorMap[prefix] || "bg-surface-inset text-content-muted";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {action}
    </span>
  );
}

const ALL_ACTIONS = [
  "org.suspend",
  "org.reactivate",
  "org.impersonate",
  "pricing.update",
  "config.update",
  "newsletter.send",
  "user.delete",
  "user.role_change",
  "alert.create",
];

/* ---------- Skeletons ---------- */

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-7 w-24 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  warn,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  loading?: boolean;
}) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-all duration-300 hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">{label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${warn ? "text-amber-400" : accent ? "text-accent-text" : "text-content"}`}>
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-content-faint">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${warn ? "bg-amber-500/10 text-amber-400" : accent ? "bg-accent-subtle-bg/10 text-accent-text" : "bg-surface-inset text-content-muted"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */

const icons = {
  log: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  shield: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  user: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  clock: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

/* ---------- Main Page ---------- */

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [debouncedActor, setDebouncedActor] = useState("");

  // Debounce actor search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedActor(actorSearch), 300);
    return () => clearTimeout(t);
  }, [actorSearch]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [actionFilter, debouncedActor]);

  // Fetch
  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (actionFilter) params.set("action", actionFilter);
      if (debouncedActor) params.set("actor", debouncedActor);

      try {
        const res = await fetch(`/api/admin/audit-log?${params}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          setTotal(data.total || 0);
        }
      } catch {
        // silently fail
      }
      setLoading(false);
    }
    load();
  }, [page, actionFilter, debouncedActor]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Stats from loaded data
  const uniqueActors = new Set(logs.map((l) => l.actorEmail)).size;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">Audit Log</h1>
        <p className="mt-1 text-sm text-content-muted">
          Complete trail of admin actions across the platform.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Events"
          value={loading ? "--" : String(total)}
          sub="All recorded actions"
          icon={icons.log}
          loading={loading}
        />
        <StatCard
          label="This Page"
          value={loading ? "--" : String(logs.length)}
          sub={`Page ${page + 1} of ${totalPages || 1}`}
          icon={icons.clock}
          loading={loading}
        />
        <StatCard
          label="Unique Actors"
          value={loading ? "--" : String(uniqueActors)}
          sub="On current page"
          icon={icons.user}
          loading={loading}
        />
        <StatCard
          label="Security Events"
          value={loading ? "--" : String(logs.filter((l) => l.action === "org.impersonate" || l.action.startsWith("user.")).length)}
          sub="Impersonations & role changes"
          icon={icons.shield}
          warn={logs.some((l) => l.action === "org.impersonate")}
          loading={loading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        >
          <option value="">All Actions</option>
          {ALL_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_CATEGORIES[a]?.label || a}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search by actor email..."
          value={actorSearch}
          onChange={(e) => setActorSearch(e.target.value)}
          className="rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />

        {(actionFilter || actorSearch) && (
          <button
            onClick={() => {
              setActionFilter("");
              setActorSearch("");
            }}
            className="text-xs text-content-faint hover:text-content"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Time
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Actor
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Action
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Target
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-content-faint"
                  >
                    No audit log entries found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-card-hover">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-content-faint">
                      {timeAgo(log.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="truncate text-sm font-medium text-content">
                        {log.actorEmail}
                      </p>
                    </td>
                    <td className="px-5 py-3">{actionBadge(log.action)}</td>
                    <td className="px-5 py-3">
                      {log.targetName ? (
                        <div>
                          <p className="truncate text-sm text-content">
                            {log.targetName}
                          </p>
                          <p className="text-[11px] text-content-faint">
                            {log.targetType}
                            {log.targetId ? ` / ${log.targetId.slice(0, 8)}...` : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-content-faint">--</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-content-faint">
                      {log.ipAddress || "--"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <p className="text-xs text-content-faint">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-edge px-3 py-1.5 text-xs text-content transition-colors hover:bg-surface-card-hover disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-edge px-3 py-1.5 text-xs text-content transition-colors hover:bg-surface-card-hover disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
