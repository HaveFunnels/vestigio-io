"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import ExportButton from "@/components/app/ExportButton";

// ──────────────────────────────────────────────
// Admin — Organizations
// Lists all orgs with expandable detail (members + environments).
// Actions: view detail, suspend/reactivate, impersonate owner.
// ──────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  plan: string;
  status: string;
  orgType: "customer" | "demo" | "trial";
  trialEndsAt: string | null;
  envCount: number;
  memberCount: number;
  createdAt: string;
}

interface OrgMember {
  id: string;
  role: string;
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  userRole: string | null;
  joinedAt: string;
}

interface OrgEnvironment {
  id: string;
  domain: string;
  landingUrl: string;
  isProduction: boolean;
  createdAt: string;
}

interface OrgDetail {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  status: string;
  orgType: "customer" | "demo" | "trial";
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: OrgMember[];
  environments: OrgEnvironment[];
  businessProfile: { businessModel: string; monthlyRevenue: number | null } | null;
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

/* ---------- Icons ---------- */

const icons = {
  building: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  globe: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  chevronDown: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  ),
};

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-colors hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
            {label}
          </p>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight ${
              warn
                ? "text-amber-400"
                : accent
                  ? "text-accent-text"
                  : "text-content"
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-content-faint">{sub}</p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            warn
              ? "bg-amber-500/10 text-amber-400"
              : accent
                ? "bg-accent-subtle-bg/10 text-accent-text"
                : "bg-surface-inset text-content-muted"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "customer" | "demo" | "trial">("");
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { data: session } = useSession();

  const fetchOrgs = useCallback(async (query: string, type: string) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (query) sp.set("search", query);
      if (type) sp.set("type", type);
      const qs = sp.toString();
      const res = await fetch(`/api/admin/organizations${qs ? `?${qs}` : ""}`);
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
    fetchOrgs(search, typeFilter);
  }, [fetchOrgs, search, typeFilter]);

  async function fetchOrgDetail(orgId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setOrgDetail(data.organization);
      }
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }

  function handleToggleDetail(orgId: string) {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      setOrgDetail(null);
    } else {
      setExpandedOrg(orgId);
      fetchOrgDetail(orgId);
    }
  }

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
        fetchOrgs(search, typeFilter);
        if (expandedOrg === org.id) {
          fetchOrgDetail(org.id);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || `Failed to ${action} organization.`);
      }
    } catch {
      alert(`Failed to ${action} organization.`);
    }
  }

  async function handleImpersonate(org: OrgRow) {
    const adminPassword = prompt(`Enter your admin password to impersonate "${org.name}" owner.\n\nYou will be signed out of your admin session.`);
    if (!adminPassword) return;

    try {
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

      const adminEmail = session?.user?.email;
      if (!adminEmail) {
        alert("Could not determine admin email");
        return;
      }

      const result = await signIn("impersonate", {
        redirect: false,
        adminEmail,
        adminPassword,
        userEmail: data.email,
      });

      if (result?.error) {
        alert(`Impersonation failed: ${result.error}`);
      } else {
        window.location.href = "/app";
      }
    } catch {
      alert("Impersonation failed.");
    }
  }

  /* ---------- Derived stats ---------- */

  const totalOrgs = orgs.length;
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const suspendedOrgs = orgs.filter((o) => o.status === "suspended").length;
  const totalMembers = orgs.reduce((s, o) => s + o.memberCount, 0);
  const totalEnvs = orgs.reduce((s, o) => s + o.envCount, 0);

  /* ---------- Status badge ---------- */

  function statusBadge(status: string) {
    const styles =
      status === "active"
        ? "bg-emerald-500/10 text-emerald-400"
        : status === "suspended"
          ? "bg-red-500/10 text-red-400"
          : "bg-amber-500/10 text-amber-400";
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${styles}`}>
        {status}
      </span>
    );
  }

  function planBadge(plan: string) {
    const styles =
      plan === "max"
        ? "bg-purple-500/10 text-purple-400"
        : plan === "pro"
          ? "bg-accent-subtle-bg/10 text-accent-text"
          : "bg-surface-inset text-content-muted";
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${styles}`}>
        {plan}
      </span>
    );
  }

  function orgTypeBadge(org: OrgRow) {
    if (org.orgType === "demo") {
      return (
        <span className="inline-block rounded border px-2 py-0.5 text-xs font-medium bg-zinc-500/10 text-content-muted border-zinc-500/20">
          Demo
        </span>
      );
    }
    if (org.orgType === "trial") {
      let daysLeft = "";
      if (org.trialEndsAt) {
        const diff = new Date(org.trialEndsAt).getTime() - Date.now();
        const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        daysLeft = ` (${days}d left)`;
      }
      return (
        <span className="inline-block rounded border px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          Trial{daysLeft}
        </span>
      );
    }
    return null; // customer — no badge
  }

  function roleBadge(role: string) {
    const styles =
      role === "owner"
        ? "bg-accent-subtle-bg/10 text-accent-text"
        : role === "admin"
          ? "bg-amber-500/10 text-amber-400"
          : "bg-surface-inset text-content-muted";
    return (
      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${styles}`}>
        {role}
      </span>
    );
  }

  const placeholder = loading ? "..." : "--";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-content">Organizations</h1>
            <p className="mt-1 text-sm text-content-muted">
              Manage tenant organizations, members, and environments.
            </p>
          </div>
          <ExportButton
            data={orgs.map((o) => ({
              name: o.name,
              plan: o.plan,
              status: o.status,
              type: o.orgType,
              trialEndsAt: o.trialEndsAt || "",
              members: o.memberCount,
              environments: o.envCount,
              created: o.createdAt,
            }))}
            filename="organizations"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <Link
            href="/app/admin/organizations/new"
            className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30"
          >
            New Organization
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Organizations"
          value={loading ? placeholder : String(totalOrgs)}
          sub={`${activeOrgs} active, ${suspendedOrgs} suspended`}
          icon={icons.building}
        />
        <StatCard
          label="Total Members"
          value={loading ? placeholder : String(totalMembers)}
          sub={`Across ${totalOrgs} organizations`}
          icon={icons.users}
        />
        <StatCard
          label="Total Environments"
          value={loading ? placeholder : String(totalEnvs)}
          sub="Domains registered"
          icon={icons.globe}
        />
        <StatCard
          label="Active Orgs"
          value={loading ? placeholder : String(activeOrgs)}
          sub={suspendedOrgs > 0 ? `${suspendedOrgs} suspended` : "All healthy"}
          icon={icons.building}
          accent
          warn={suspendedOrgs > 0}
        />
      </div>

      {/* Org Type Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-edge bg-surface-card p-1">
        {([
          { value: "" as const, label: "All" },
          { value: "customer" as const, label: "Customers" },
          { value: "trial" as const, label: "Trial" },
          { value: "demo" as const, label: "Demo" },
        ] as const).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTypeFilter(tab.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              typeFilter === tab.value
                ? "bg-surface-inset text-content shadow-sm"
                : "text-content-muted hover:text-content-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Org List */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">
            {typeFilter ? `${typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)} Organizations` : "All Organizations"}
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            Loading...
          </div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            {search ? "No matches." : "No organizations yet."}
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {orgs.map((org) => {
              const isOpen = expandedOrg === org.id;
              return (
                <div key={org.id}>
                  {/* Org row */}
                  <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-card-hover">
                    {/* Expand toggle */}
                    <button
                      onClick={() => handleToggleDetail(org.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-inset hover:text-content-secondary"
                    >
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {/* Org info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <p className="truncate text-sm font-semibold text-content">
                          {org.name}
                        </p>
                        {planBadge(org.plan)}
                        {statusBadge(org.status)}
                        {orgTypeBadge(org)}
                      </div>
                      <p className="mt-0.5 text-xs text-content-faint">
                        {org.memberCount} member{org.memberCount !== 1 ? "s" : ""} &middot;{" "}
                        {org.envCount} environment{org.envCount !== 1 ? "s" : ""} &middot;{" "}
                        Created {timeAgo(org.createdAt)}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/app/admin/organizations/${org.id}`}
                        className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
                      >
                        Detail
                      </Link>
                      <button
                        onClick={() => handleToggleDetail(org.id)}
                        className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
                      >
                        {isOpen ? "Close" : "View"}
                      </button>
                      <button
                        onClick={() => handleSuspend(org)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          org.status === "suspended"
                            ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        }`}
                      >
                        {org.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                      <button
                        onClick={() => handleImpersonate(org)}
                        className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/10"
                      >
                        Impersonate
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isOpen && (
                    <div className="border-t border-edge bg-surface-inset/30 px-5 py-5">
                      {detailLoading ? (
                        <div className="py-8 text-center text-sm text-content-faint">
                          Loading organization details...
                        </div>
                      ) : orgDetail && orgDetail.id === org.id ? (
                        <div className="grid gap-5 lg:grid-cols-2">
                          {/* Members */}
                          <div className="rounded-lg border border-edge bg-surface-card">
                            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                                Members ({orgDetail.members.length})
                              </h3>
                            </div>
                            {orgDetail.members.length === 0 ? (
                              <div className="px-4 py-6 text-center text-xs text-content-faint">
                                No members found.
                              </div>
                            ) : (
                              <div className="divide-y divide-edge">
                                {orgDetail.members.map((member) => (
                                  <div
                                    key={member.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                  >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-inset text-xs font-semibold text-content-muted">
                                      {member.name
                                        ? member.name.charAt(0).toUpperCase()
                                        : member.email
                                          ? member.email.charAt(0).toUpperCase()
                                          : "?"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium text-content">
                                          {member.name || "Unnamed"}
                                        </p>
                                        {roleBadge(member.role)}
                                      </div>
                                      <p className="truncate text-xs text-content-faint">
                                        {member.email}
                                      </p>
                                    </div>
                                    <p className="shrink-0 text-[11px] text-content-faint">
                                      Joined {timeAgo(member.joinedAt)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Environments */}
                          <div className="rounded-lg border border-edge bg-surface-card">
                            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                                Environments ({orgDetail.environments.length})
                              </h3>
                            </div>
                            {orgDetail.environments.length === 0 ? (
                              <div className="px-4 py-6 text-center text-xs text-content-faint">
                                No environments found.
                              </div>
                            ) : (
                              <div className="divide-y divide-edge">
                                {orgDetail.environments.map((env) => (
                                  <div
                                    key={env.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                  >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-content-muted">
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                                      </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-content">
                                        {env.domain}
                                      </p>
                                      <p className="truncate text-xs text-content-faint">
                                        {env.landingUrl}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {env.isProduction && (
                                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                                          production
                                        </span>
                                      )}
                                      <p className="text-[11px] text-content-faint">
                                        {timeAgo(env.createdAt)}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Organization type */}
                          {(orgDetail.orgType === "demo" || orgDetail.orgType === "trial") && (
                            <div className="rounded-lg border border-edge bg-surface-card px-4 py-3 lg:col-span-2">
                              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
                                Organization Type
                              </h3>
                              <div className="flex gap-6 text-sm">
                                <span className="text-content-faint">
                                  Type:{" "}
                                  <span className="font-medium capitalize text-content">
                                    {orgDetail.orgType}
                                  </span>
                                </span>
                                {orgDetail.orgType === "trial" && orgDetail.trialEndsAt && (
                                  <span className="text-content-faint">
                                    Trial Ends:{" "}
                                    <span className="font-medium text-amber-600 dark:text-amber-400">
                                      {new Date(orgDetail.trialEndsAt).toLocaleDateString()} ({Math.max(0, Math.ceil((new Date(orgDetail.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d remaining)
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Business profile (if available) */}
                          {orgDetail.businessProfile && (
                            <div className="rounded-lg border border-edge bg-surface-card px-4 py-3 lg:col-span-2">
                              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
                                Business Profile
                              </h3>
                              <div className="flex gap-6 text-sm">
                                <span className="text-content-faint">
                                  Model:{" "}
                                  <span className="font-medium capitalize text-content">
                                    {orgDetail.businessProfile.businessModel}
                                  </span>
                                </span>
                                {orgDetail.businessProfile.monthlyRevenue != null && (
                                  <span className="text-content-faint">
                                    Monthly Revenue:{" "}
                                    <span className="font-medium text-content">
                                      ${orgDetail.businessProfile.monthlyRevenue.toLocaleString()}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-sm text-content-faint">
                          Failed to load details.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
