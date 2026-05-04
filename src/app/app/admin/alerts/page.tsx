"use client";

import { useState, useEffect } from "react";
import CustomSelect from "@/components/console/CustomSelect";

// ──────────────────────────────────────────────
// Admin Alerts — Rules management + Event log
// ──────────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  metric: string;
  condition: string;
  threshold: number;
  window: number;
  channel: string;
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
  events: AlertEvent[];
}

interface AlertEvent {
  id: string;
  ruleId: string;
  value: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  rule?: { name: string; metric: string };
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

const METRIC_LABELS: Record<string, string> = {
  error_rate: "Error Rate",
  mcp_usage: "MCP Usage",
  health_check: "Health Check",
  org_over_limit: "Org Over Limit",
  new_signup: "New Signup",
};

const CONDITION_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  eq: "=",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  both: "Both",
};

/* ---------- Skeletons ---------- */

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

function SkeletonRuleRow() {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" />
      </div>
      <div className="h-6 w-12 animate-pulse rounded-full bg-white/[0.06]" />
    </div>
  );
}

function SkeletonEventRow() {
  return (
    <tr>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-12 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
    </tr>
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
  bell: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  exclamation: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  bolt: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
};

/* ---------- Main Page ---------- */

const EVENTS_PAGE_SIZE = 20;

export default function AlertsPage() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMetric, setFormMetric] = useState("error_rate");
  const [formCondition, setFormCondition] = useState("gt");
  const [formThreshold, setFormThreshold] = useState("0");
  const [formWindow, setFormWindow] = useState("10");
  const [formChannel, setFormChannel] = useState("email");
  const [formEnabled, setFormEnabled] = useState(true);

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormMetric("error_rate");
    setFormCondition("gt");
    setFormThreshold("0");
    setFormWindow("10");
    setFormChannel("email");
    setFormEnabled(true);
    setEditingRule(null);
  }

  function startEdit(rule: AlertRule) {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description || "");
    setFormMetric(rule.metric);
    setFormCondition(rule.condition);
    setFormThreshold(String(rule.threshold));
    setFormWindow(String(rule.window));
    setFormChannel(rule.channel);
    setFormEnabled(rule.enabled);
    setShowForm(true);
  }

  // Load rules
  async function loadRules() {
    try {
      const res = await fetch("/api/admin/alerts");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // silently fail
    }
  }

  // Load events
  async function loadEvents() {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(EVENTS_PAGE_SIZE));
      params.set("offset", String(eventsPage * EVENTS_PAGE_SIZE));
      const res = await fetch(`/api/admin/alerts/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setEventsTotal(data.total || 0);
      }
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadRules(), loadEvents()]);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [eventsPage]);

  // Save rule
  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formName,
        description: formDescription || undefined,
        metric: formMetric,
        condition: formCondition,
        threshold: parseFloat(formThreshold),
        window: parseInt(formWindow, 10),
        channel: formChannel,
        enabled: formEnabled,
      };
      if (editingRule) body.id = editingRule.id;

      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await loadRules();
        setShowForm(false);
        resetForm();
      }
    } catch {
      // silently fail
    }
    setSaving(false);
  }

  // Delete rule
  async function handleDelete(id: string) {
    try {
      await fetch("/api/admin/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadRules();
    } catch {
      // silently fail
    }
  }

  // Toggle enable/disable
  async function handleToggle(rule: AlertRule) {
    try {
      await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          threshold: rule.threshold,
          window: rule.window,
          channel: rule.channel,
          enabled: !rule.enabled,
        }),
      });
      await loadRules();
    } catch {
      // silently fail
    }
  }

  // Acknowledge event
  async function handleAcknowledge(id: string) {
    try {
      await fetch("/api/admin/alerts/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
      );
    } catch {
      // silently fail
    }
  }

  const enabledRules = rules.filter((r) => r.enabled).length;
  const unackEvents = events.filter((e) => !e.acknowledged).length;
  const eventsTotalPages = Math.ceil(eventsTotal / EVENTS_PAGE_SIZE);

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">Alerts & Thresholds</h1>
        <p className="mt-1 text-sm text-content-muted">
          Configure metric-based alerts and review triggered events.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Rules"
          value={loading ? "--" : String(rules.length)}
          sub={`${enabledRules} active`}
          icon={icons.bell}
          accent
          loading={loading}
        />
        <StatCard
          label="Enabled Rules"
          value={loading ? "--" : String(enabledRules)}
          sub="Currently monitoring"
          icon={icons.bolt}
          accent
          loading={loading}
        />
        <StatCard
          label="Total Events"
          value={loading ? "--" : String(eventsTotal)}
          sub="All triggered alerts"
          icon={icons.exclamation}
          loading={loading}
        />
        <StatCard
          label="Unacknowledged"
          value={loading ? "--" : String(unackEvents)}
          sub="Require attention"
          icon={icons.exclamation}
          warn={unackEvents > 0}
          loading={loading}
        />
      </div>

      {/* ── Active Rules ── */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">Alert Rules</h2>
          <button
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
            className="rounded-md bg-accent-subtle-bg/10 px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/20"
          >
            {showForm ? "Cancel" : "+ New Rule"}
          </button>
        </div>

        {/* Create / Edit Form */}
        {showForm && (
          <div className="border-b border-edge px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="High error rate"
                  className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Metric
                </label>
                <CustomSelect
                  value={formMetric}
                  onChange={setFormMetric}
                  options={Object.entries(METRIC_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Condition
                </label>
                <CustomSelect
                  value={formCondition}
                  onChange={setFormCondition}
                  options={[
                    { value: "gt", label: "Greater than (>)" },
                    { value: "lt", label: "Less than (<)" },
                    { value: "eq", label: "Equal to (=)" },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Threshold
                </label>
                <input
                  type="number"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Window (minutes)
                </label>
                <input
                  type="number"
                  value={formWindow}
                  onChange={(e) => setFormWindow(e.target.value)}
                  className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Channel
                </label>
                <CustomSelect
                  value={formChannel}
                  onChange={setFormChannel}
                  options={Object.entries(CHANNEL_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  }))}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Alert when error rate exceeds threshold"
                  className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="rounded-md bg-accent-subtle-bg/10 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/20 disabled:opacity-40"
              >
                {saving ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
              </button>
              <label className="flex items-center gap-2 text-sm text-content-muted">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="rounded border-edge"
                />
                Enabled
              </label>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="divide-y divide-edge">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonRuleRow key={i} />)
          ) : rules.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-content-faint">
              No alert rules configured. Click &quot;+ New Rule&quot; to get started.
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface-card-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-content">
                      {rule.name}
                    </p>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        rule.enabled
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-surface-inset text-content-faint"
                      }`}
                    >
                      {rule.enabled ? "active" : "disabled"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-content-faint">
                    {METRIC_LABELS[rule.metric] || rule.metric}{" "}
                    {CONDITION_LABELS[rule.condition] || rule.condition}{" "}
                    {rule.threshold} within {rule.window}m
                    {" / "}
                    {CHANNEL_LABELS[rule.channel] || rule.channel}
                    {rule.lastTriggered && (
                      <span className="ml-2 text-amber-400">
                        Last triggered {timeAgo(rule.lastTriggered)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(rule)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      rule.enabled ? "bg-emerald-500" : "bg-surface-inset"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  {/* Edit */}
                  <button
                    onClick={() => startEdit(rule)}
                    className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
                  >
                    Edit
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Recent Events ── */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">Alert Events</h2>
          {eventsTotal > 0 && (
            <p className="text-xs text-content-faint">
              {eventsTotal} total event{eventsTotal !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Time
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Rule
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Value
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Message
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonEventRow key={i} />)
              ) : events.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-content-faint"
                  >
                    No alert events recorded.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt.id}
                    className={`hover:bg-surface-card-hover ${
                      !evt.acknowledged ? "bg-amber-500/[0.03]" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-content-faint">
                      {timeAgo(evt.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="truncate text-sm font-medium text-content">
                        {evt.rule?.name || "Unknown"}
                      </p>
                      <p className="text-[11px] text-content-faint">
                        {evt.rule?.metric ? METRIC_LABELS[evt.rule.metric] || evt.rule.metric : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-400">
                        {evt.value}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-xs text-content">
                      {evt.message}
                    </td>
                    <td className="px-5 py-3">
                      {evt.acknowledged ? (
                        <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400">
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAcknowledge(evt.id)}
                          className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {eventsTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <p className="text-xs text-content-faint">
              Showing {eventsPage * EVENTS_PAGE_SIZE + 1}–
              {Math.min((eventsPage + 1) * EVENTS_PAGE_SIZE, eventsTotal)} of{" "}
              {eventsTotal}
            </p>
            <div className="flex gap-2">
              <button
                disabled={eventsPage === 0}
                onClick={() => setEventsPage((p) => p - 1)}
                className="rounded-md border border-edge px-3 py-1.5 text-xs text-content transition-colors hover:bg-surface-card-hover disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={eventsPage >= eventsTotalPages - 1}
                onClick={() => setEventsPage((p) => p + 1)}
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
