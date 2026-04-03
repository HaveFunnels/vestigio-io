"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";

// ──────────────────────────────────────────────
// Admin — Organizations
// Lists all orgs, plan, status. Actions: suspend, impersonate.
// Data fetched from /api/admin/organizations.
// ──────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  plan: string;
  status: string;
  envCount: number;
  memberCount: number;
  createdAt: string;
}

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState("");
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : "";
      const res = await fetch(`/api/admin/organizations${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs(search);
  }, [fetchOrgs, search]);

  async function handleSuspend(org: OrgRow) {
    const isSuspended = org.status === "suspended";
    const action = isSuspended ? "reactivate" : "suspend";
    if (!confirm(`Are you sure you want to ${action} "${org.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/organizations/${org.id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !isSuspended }),
      });
      if (res.ok) {
        // Refresh the list
        fetchOrgs(search);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || `Failed to ${action} organization.`);
      }
    } catch {
      alert(`Failed to ${action} organization.`);
    }
  }

  function handleView(org: OrgRow) {
    alert(`View organization: ${org.name} (${org.id})\n\nOrg detail page coming soon.`);
  }

  async function handleImpersonate(org: OrgRow) {
    if (!confirm(`Login as the owner of "${org.name}"?\n\nYou will be signed out of your admin session and logged in as the org owner.`)) return;

    try {
      // Get the org owner's email
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to find org owner");
        return;
      }

      // Get current admin email from session
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      const adminEmail = session?.user?.email;

      if (!adminEmail) {
        alert("Could not determine admin email");
        return;
      }

      // Sign in as the user via impersonate provider
      const result = await signIn("impersonate", {
        redirect: false,
        adminEmail,
        userEmail: data.email,
      });

      if (result?.error) {
        alert(`Impersonation failed: ${result.error}`);
      } else {
        // Full page reload to pick up new session
        window.location.href = "/app";
      }
    } catch {
      alert("Impersonation failed. Check console for details.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Organizations</h1>
          <p className="mt-1 text-sm text-body-color">Manage all tenant organizations.</p>
        </div>
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-stroke bg-transparent px-4 py-2 text-sm dark:border-stroke-dark"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Environments</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-body-color">Loading...</td>
              </tr>
            ) : orgs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-body-color">
                  {search ? "No matches." : "No organizations yet. They will appear after users complete onboarding."}
                </td>
              </tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="border-b border-stroke dark:border-stroke-dark">
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{org.plan}</span>
                  </td>
                  <td className="px-4 py-3">{org.envCount}</td>
                  <td className="px-4 py-3">{org.memberCount}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${org.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : org.status === "suspended" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body-color">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleView(org)} className="text-xs text-primary hover:underline">View</button>
                      <button onClick={() => handleSuspend(org)} className="text-xs text-amber-500 hover:underline">
                        {org.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                      <button onClick={() => handleImpersonate(org)} className="text-xs text-body-color hover:underline">Impersonate</button>
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
