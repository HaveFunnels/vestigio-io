"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ──────────────────────────────────────────────
// Admin — Environments
// All domains across all orgs. Trigger audits, maintenance.
// Data fetched from /api/admin/environments.
// ──────────────────────────────────────────────

interface EnvRow {
  id: string;
  domain: string;
  orgName: string;
  isProduction: boolean;
  lastAuditStatus: string;
  createdAt: string;
}

export default function AdminEnvironmentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [environments, setEnvironments] = useState<EnvRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  function handleTriggerAudit(env: EnvRow) {
    alert(`Trigger audit for: ${env.domain} (${env.id})\n\nThis feature is not yet implemented.`);
  }

  function handleViewFindings(env: EnvRow) {
    router.push(`/app/findings?environment=${env.id}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Environments</h1>
          <p className="mt-1 text-sm text-body-color">All domains and their audit status.</p>
        </div>
        <input type="text" placeholder="Search domains..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-stroke bg-transparent px-4 py-2 text-sm dark:border-stroke-dark" />
      </div>

      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-inset/60">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Domain</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted sm:table-cell">Organization</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted lg:table-cell">Production</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Last Audit</th>
              <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted lg:table-cell">Created</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-content-faint">Loading...</td></tr>
            ) : environments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-content-faint">{search ? "No matches." : "No environments found."}</td></tr>
            ) : (
              environments.map((env) => (
                <tr key={env.id} className="border-b border-edge transition-colors hover:bg-surface-card-hover">
                  <td className="px-4 py-3 font-medium text-content">{env.domain}</td>
                  <td className="hidden px-4 py-3 text-content-tertiary sm:table-cell">{env.orgName}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{env.isProduction ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${env.lastAuditStatus === "complete" ? "bg-emerald-500/10 text-emerald-400" : env.lastAuditStatus === "running" ? "bg-blue-500/10 text-blue-400" : env.lastAuditStatus === "failed" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {env.lastAuditStatus}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-content-muted lg:table-cell">{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleTriggerAudit(env)} className="text-xs text-accent-text hover:underline">Trigger Audit</button>
                      <button onClick={() => handleViewFindings(env)} className="text-xs text-content-muted hover:underline">View Findings</button>
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
