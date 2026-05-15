"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Admin — MCP Observability
//
// Surfaces the operator-facing metrics emitted by the in-process MCP
// server: prompt-gate behavior, playbook engagement, suggestion clicks,
// and session aggregates. Source of truth is the existing
// /api/admin/usage?view=mcp_observability endpoint, which proxies
// apps/platform/mcp-observability.ts.
//
// Goal of this page: spot regressions in engagement (rising weak-prompt
// rate, dropping playbook completion) and unit-economics signals (chain
// depth × queries-per-session) without pinging the runner directly.
// ──────────────────────────────────────────────

interface PromptGate {
  total_evaluated: number;
  weak_count: number;
  weak_prompt_rate: number;
  rewrites_offered: number;
  rewrites_accepted: number;
  rewrites_rejected: number;
  rewrite_acceptance_rate: number;
}

interface Playbooks {
  total_runs: number;
  completed: number;
  abandoned: number;
  completion_rate: number;
  top_playbooks: { playbook_id: string; run_count: number }[];
}

interface Suggestions {
  click_counts: Record<string, number>;
  most_clicked_type: string | null;
}

interface Sessions {
  total_sessions: number;
  avg_queries_per_session: number;
  avg_chain_depth: number;
  sessions_with_playbook: number;
  sessions_with_rewrites: number;
}

interface Dashboard {
  prompt_gate: PromptGate;
  playbooks: Playbooks;
  suggestions: Suggestions;
  sessions: Sessions;
}

/* ---------- Helpers ---------- */

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function pct(n: number): string {
  return `${n}%`;
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight ${
          warn ? "text-amber-400" : accent ? "text-accent-text" : "text-content"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-content-faint">{sub}</p>}
    </div>
  );
}

/* ---------- Page ---------- */

export default function MCPObservabilityPage() {
  const t = useTranslations("console.admin.mcp_observability");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/usage?view=mcp_observability");
        if (!res.ok) {
          if (mounted) setError(`Failed to load (${res.status})`);
          return;
        }
        const json = await res.json();
        if (mounted) setData(json.mcp_observability);
      } catch {
        if (mounted) setError("Network error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const placeholder = loading ? "…" : "—";

  const pg = data?.prompt_gate;
  const pb = data?.playbooks;
  const sg = data?.suggestions;
  const ss = data?.sessions;

  // Engagement signals worth flagging visually:
  //  - weak-prompt rate creeping past 30% means users aren't getting their
  //    queries right; either the suggestion engine or onboarding is slipping
  //  - rewrite-accept under 40% means the gate is suggesting rewrites users
  //    don't trust; tune the rewrite heuristics
  //  - playbook completion under 50% means users abandon mid-flow; the flow
  //    is either too long or the value isn't obvious enough
  const weakRateWarn = (pg?.weak_prompt_rate ?? 0) > 30;
  const rewriteRateWarn = (pg?.rewrite_acceptance_rate ?? 100) < 40 && (pg?.rewrites_offered ?? 0) > 0;
  const completionWarn = (pb?.completion_rate ?? 100) < 50 && (pb?.total_runs ?? 0) > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-content">{t("page_title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("page_subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Prompt Gate ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-content">{t("section_prompt_gate")}</h2>
          <p className="text-xs text-content-faint">
            {t("section_prompt_gate_desc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("stat_total_evaluated")}
            value={pg ? formatNum(pg.total_evaluated) : placeholder}
          />
          <StatCard
            label={t("stat_weak_prompt_rate")}
            value={pg ? pct(pg.weak_prompt_rate) : placeholder}
            sub={pg ? t("flagged_count", { count: pg.weak_count }) : undefined}
            warn={weakRateWarn}
          />
          <StatCard
            label={t("stat_rewrites_offered")}
            value={pg ? formatNum(pg.rewrites_offered) : placeholder}
            sub={pg ? t("rewrites_accepted_rejected", { accepted: formatNum(pg.rewrites_accepted), rejected: formatNum(pg.rewrites_rejected) }) : undefined}
          />
          <StatCard
            label={t("stat_rewrite_acceptance")}
            value={pg && pg.rewrites_offered > 0 ? pct(pg.rewrite_acceptance_rate) : placeholder}
            warn={rewriteRateWarn}
          />
        </div>
      </div>

      {/* ── Playbooks ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-content">{t("section_playbooks")}</h2>
          <p className="text-xs text-content-faint">
            {t("section_playbooks_desc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("stat_total_runs")}
            value={pb ? formatNum(pb.total_runs) : placeholder}
          />
          <StatCard
            label={t("stat_completed")}
            value={pb ? formatNum(pb.completed) : placeholder}
            accent
          />
          <StatCard
            label={t("stat_abandoned")}
            value={pb ? formatNum(pb.abandoned) : placeholder}
            warn={(pb?.abandoned ?? 0) > (pb?.completed ?? 0) && (pb?.total_runs ?? 0) > 0}
          />
          <StatCard
            label={t("stat_completion_rate")}
            value={pb && pb.total_runs > 0 ? pct(pb.completion_rate) : placeholder}
            warn={completionWarn}
          />
        </div>
        {pb && pb.top_playbooks.length > 0 && (
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                {t("top_playbooks")}
              </h3>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-2 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_playbook")}
                  </th>
                  <th className="px-5 py-2 text-right text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_runs")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {pb.top_playbooks.map((p) => (
                  <tr key={p.playbook_id}>
                    <td className="px-5 py-2 font-mono text-xs text-content-secondary">
                      {p.playbook_id}
                    </td>
                    <td className="px-5 py-2 text-right text-xs font-mono tabular-nums text-content">
                      {formatNum(p.run_count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sessions ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-content">{t("section_sessions")}</h2>
          <p className="text-xs text-content-faint">
            {t("section_sessions_desc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("stat_total_sessions")}
            value={ss ? formatNum(ss.total_sessions) : placeholder}
          />
          <StatCard
            label={t("stat_avg_queries")}
            value={ss ? ss.avg_queries_per_session.toFixed(1) : placeholder}
          />
          <StatCard
            label={t("stat_avg_chain_depth")}
            value={ss ? ss.avg_chain_depth.toFixed(1) : placeholder}
            sub={t("chain_depth_sub")}
          />
          <StatCard
            label={t("stat_with_playbook")}
            value={ss ? formatNum(ss.sessions_with_playbook) : placeholder}
            sub={ss ? t("with_rewrites_count", { count: formatNum(ss.sessions_with_rewrites) }) : undefined}
          />
        </div>
      </div>

      {/* ── Suggestion Clicks ── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-content">{t("section_suggestions")}</h2>
          <p className="text-xs text-content-faint">
            {t("section_suggestions_desc")}
          </p>
        </div>
        {sg && Object.keys(sg.click_counts).length > 0 ? (
          <div className="rounded-lg border border-edge bg-surface-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-2 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_suggestion_type")}
                  </th>
                  <th className="px-5 py-2 text-right text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_clicks")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {Object.entries(sg.click_counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <tr key={type}>
                      <td className="px-5 py-2 font-mono text-xs text-content-secondary">
                        {type}
                        {type === sg.most_clicked_type && (
                          <span className="ml-2 rounded bg-accent-subtle-bg/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-text">
                            {t("badge_top")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right text-xs font-mono tabular-nums text-content">
                        {formatNum(count)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-edge bg-surface-card px-5 py-8 text-center text-sm text-content-faint">
            {t("no_suggestions_yet")}
          </div>
        )}
      </div>
    </div>
  );
}
