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

      <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Production</th>
              <th className="px-4 py-3 font-medium">Last Audit</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-body-color">Loading...</td></tr>
            ) : environments.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-body-color">{search ? "No matches." : "No environments found."}</td></tr>
            ) : (
              environments.map((env) => (
                <tr key={env.id} className="border-b border-stroke dark:border-stroke-dark">
                  <td className="px-4 py-3 font-medium">{env.domain}</td>
                  <td className="px-4 py-3">{env.orgName}</td>
                  <td className="px-4 py-3">{env.isProduction ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${env.lastAuditStatus === "complete" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : env.lastAuditStatus === "running" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : env.lastAuditStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                      {env.lastAuditStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body-color">{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleTriggerAudit(env)} className="text-xs text-primary hover:underline">Trigger Audit</button>
                      <button onClick={() => handleViewFindings(env)} className="text-xs text-body-color hover:underline">View Findings</button>
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
