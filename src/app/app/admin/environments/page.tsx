"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Admin — Environments
// All domains across all orgs. Trigger audits, maintenance.
// Data fetched from /api/admin/environments.
// ──────────────────────────────────────────────

interface EnvRow {
  id: string;
  domain: string;
  organizationId: string;
  orgName: string;
  isProduction: boolean;
  lastAuditStatus: string;
  createdAt: string;
}

export default function AdminEnvironmentsPage() {
  const router = useRouter();
  const t = useTranslations("console.admin.environments");
  const [search, setSearch] = useState("");
  const [environments, setEnvironments] = useState<EnvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const fetchEnvironments = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : "";
      const res = await fetch(`/api/admin/environments${params}`);
      if (res.ok) {
        const data = await res.json();
        setEnvironments(data.environments || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments(search);
  }, [fetchEnvironments, search]);

  // Triggers a full (cold) audit for the env's organization via the same
  // endpoint the org detail page uses. The endpoint resolves the prod env
  // server-side, so we pass `organizationId` rather than `environmentId`.
  // 409 means a cycle is already running — we surface that explicitly
  // instead of as a generic failure.
  async function handleTriggerAudit(env: EnvRow) {
    if (triggeringId) return;
    setTriggeringId(env.id);
    try {
      const res = await fetch("/api/admin/trigger-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: env.organizationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`Audit started for ${env.domain} — cycle ${data.cycleId}`);
        // Refresh so the row's status flips to running.
        fetchEnvironments(search);
      } else if (res.status === 409) {
        alert(data.message || `An audit is already in progress for ${env.domain}.`);
      } else {
        alert(data.message || `Failed to trigger audit for ${env.domain}.`);
      }
    } catch {
      alert(`Network error triggering audit for ${env.domain}.`);
    } finally {
      setTriggeringId(null);
    }
  }

  function handleViewFindings(env: EnvRow) {
    router.push(`/app/findings?environment=${env.id}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">{t("title")}</h1>
          <p className="mt-1 text-sm text-body-color">{t("subtitle")}</p>
        </div>
        <input type="text" placeholder={t("search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-stroke bg-transparent px-4 py-2 text-sm dark:border-stroke-dark" />
      </div>

      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-inset/60">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("col_domain")}</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted sm:table-cell">{t("col_organization")}</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted lg:table-cell">{t("col_production")}</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("col_last_audit")}</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted lg:table-cell">{t("col_created")}</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-content-faint">{t("loading")}</td></tr>
            ) : environments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-content-faint">{search ? t("no_matches") : t("no_environments")}</td></tr>
            ) : (
              environments.map((env) => (
                <tr key={env.id} className="border-b border-edge transition-colors hover:bg-surface-card-hover">
                  <td className="px-4 py-3 font-medium text-content">{env.domain}</td>
                  <td className="hidden px-4 py-3 text-content-tertiary sm:table-cell">{env.orgName}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{env.isProduction ? t("yes") : t("no")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${env.lastAuditStatus === "complete" ? "bg-emerald-500/10 text-emerald-400" : env.lastAuditStatus === "running" ? "bg-blue-500/10 text-blue-400" : env.lastAuditStatus === "failed" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {env.lastAuditStatus}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-content-muted lg:table-cell">{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTriggerAudit(env)}
                        disabled={triggeringId === env.id}
                        className="text-xs text-accent-text hover:underline disabled:opacity-50"
                      >
                        {triggeringId === env.id ? t("triggering") : t("trigger_audit")}
                      </button>
                      <button onClick={() => handleViewFindings(env)} className="text-xs text-content-muted hover:underline">{t("view_findings")}</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
