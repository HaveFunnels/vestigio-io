"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ──────────────────────────────────────────────
// Admin — Organization Detail Page
//
// Full profile view for a single organization.
// Fetches from /api/admin/organizations/[id]
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

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
  createdAt: string;
  updatedAt: string;
  members: OrgMember[];
  environments: OrgEnvironment[];
  businessProfile: {
    businessModel: string;
    monthlyRevenue: number | null;
  } | null;
  lastAudit: {
    date: string;
    status: string;
  } | null;
  usageStats: {
    period: string;
    mcpQueries: number;
    playwrightRuns: number;
  };
  billing: {
    customerId: string | null;
    subscriptionId: string | null;
    priceId: string | null;
    currentPeriodEnd: string | null;
  } | null;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- Icons ---------- */

const icons = {
  arrowLeft: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
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
  bolt: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  calendar: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
};

/* ---------- Skeleton Components ---------- */

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

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3 flex-1">
        <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
        </div>
      </div>
      <div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  warn,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
  warn?: boolean;
  loading?: boolean;
}) {
  if (loading) return <SkeletonCard />;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-all duration-300 hover:bg-surface-card-hover">
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
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
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

/* ---------- Badges ---------- */

function statusBadge(status: string) {
  const styles =
    status === "active"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "suspended"
        ? "bg-red-500/10 text-red-400"
        : "bg-amber-500/10 text-amber-400";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles}`}>
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

/* ---------- Main Page ---------- */

export default function AdminOrganizationDetailPage() {
  const params = useParams();
  const { data: session } = useSession();

  const orgId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to load organization");
        return;
      }
      const data = await res.json();
      setOrg(data.organization);
    } catch {
      setError("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  /* ---------- Actions ---------- */

  async function handleSuspend() {
    if (!org) return;
    const isSuspended = org.status === "suspended";
    const action = isSuspended ? "reactivate" : "suspend";
    if (!confirm(`Are you sure you want to ${action} "${org.name}"?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !isSuspended }),
      });
      if (res.ok) {
        await fetchOrg();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || `Failed to ${action} organization.`);
      }
    } catch {
      alert(`Failed to ${action} organization.`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleImpersonate() {
    if (!org) return;
    if (
    const adminPassword = prompt(`Enter your admin password to impersonate "${org.name}" owner.\n\nYou will be signed out.`);
    if (!adminPassword) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
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
    } finally {
      setActionLoading(false);
    }
  }

  /* ---------- Error state ---------- */

  if (error && !loading) {
    return (
      <div className="space-y-6 p-6">
        <Link
          href="/app/admin/organizations"
          className="inline-flex items-center gap-2 text-sm text-content-muted transition-colors hover:text-content"
        >
          {icons.arrowLeft}
          Back to Organizations
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6 p-6">
      {/* ── Back + Header ── */}
      <div>
        <Link
          href="/app/admin/organizations"
          className="inline-flex items-center gap-2 text-sm text-content-muted transition-colors hover:text-content"
        >
          {icons.arrowLeft}
          Back to Organizations
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-7 w-48 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-4 w-64 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ) : org ? (
            <>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-content">
                  {org.name}
                </h1>
                {planBadge(org.plan)}
                {statusBadge(org.status)}
              </div>
              <p className="mt-1 text-sm text-content-muted">
                Created {formatDate(org.createdAt)} &middot; Last updated{" "}
                {timeAgo(org.updatedAt)}
              </p>
            </>
          ) : null}
        </div>

        {/* Action buttons */}
        {!loading && org && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleSuspend}
              disabled={actionLoading}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                org.status === "suspended"
                  ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              }`}
            >
              {org.status === "suspended" ? "Reactivate" : "Suspend"}
            </button>
            <button
              onClick={handleImpersonate}
              disabled={actionLoading}
              className="rounded-lg border border-accent/30 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/10 disabled:opacity-50"
            >
              Impersonate
            </button>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Members"
          value={org ? String(org.members.length) : "0"}
          sub={
            org
              ? `${org.members.filter((m) => m.role === "owner").length} owner, ${org.members.filter((m) => m.role === "admin").length} admin`
              : undefined
          }
          icon={icons.users}
          loading={loading}
        />
        <StatCard
          label="Environments"
          value={org ? String(org.environments.length) : "0"}
          sub={
            org
              ? `${org.environments.filter((e) => e.isProduction).length} production`
              : undefined
          }
          icon={icons.globe}
          loading={loading}
        />
        <StatCard
          label="MCP Queries"
          value={org ? String(org.usageStats.mcpQueries) : "0"}
          sub={org ? `Period: ${org.usageStats.period}` : undefined}
          icon={icons.bolt}
          accent
          loading={loading}
        />
        <StatCard
          label="Last Audit"
          value={
            org
              ? org.lastAudit
                ? formatDate(org.lastAudit.date)
                : "Never"
              : "--"
          }
          sub={
            org && org.lastAudit
              ? `Status: ${org.lastAudit.status}`
              : org
                ? "No audits run yet"
                : undefined
          }
          icon={icons.calendar}
          warn={org != null && !org.lastAudit}
          loading={loading}
        />
      </div>

      {/* ── Two-column: Members + Environments ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Members Table */}
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Members{org ? ` (${org.members.length})` : ""}
            </h2>
          </div>
          {loading ? (
            <div className="divide-y divide-edge">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : org && org.members.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-content-faint">
              No members found.
            </div>
          ) : org ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Name
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Email
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Role
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {org.members.map((member) => (
                    <tr key={member.id} className="transition-colors hover:bg-surface-card-hover">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inset text-xs font-semibold text-content-muted">
                            {member.name
                              ? member.name.charAt(0).toUpperCase()
                              : member.email
                                ? member.email.charAt(0).toUpperCase()
                                : "?"}
                          </div>
                          <span className="truncate text-sm font-medium text-content">
                            {member.name || "Unnamed"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-content-faint">
                        {member.email}
                      </td>
                      <td className="px-5 py-3">{roleBadge(member.role)}</td>
                      <td className="px-5 py-3 text-xs text-content-faint">
                        {formatDate(member.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* Environments Table */}
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Environments{org ? ` (${org.environments.length})` : ""}
            </h2>
          </div>
          {loading ? (
            <div className="divide-y divide-edge">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : org && org.environments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-content-faint">
              No environments found.
            </div>
          ) : org ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Domain
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Type
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {org.environments.map((env) => (
                    <tr key={env.id} className="transition-colors hover:bg-surface-card-hover">
                      <td className="px-5 py-3">
                        <div>
                          <p className="truncate text-sm font-medium text-content">
                            {env.domain}
                          </p>
                          <p className="truncate text-xs text-content-faint">
                            {env.landingUrl}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {env.isProduction ? (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            production
                          </span>
                        ) : (
                          <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                            staging
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-content-faint">
                        {formatDate(env.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Business Profile ── */}
      {!loading && org?.businessProfile && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">
            Business Profile
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Business Model
              </p>
              <p className="mt-1 text-sm font-medium capitalize text-content">
                {org.businessProfile.businessModel.replace("_", " ")}
              </p>
            </div>
            {org.businessProfile.monthlyRevenue != null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                  Monthly Revenue
                </p>
                <p className="mt-1 text-sm font-medium text-content">
                  ${org.businessProfile.monthlyRevenue.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Billing Info ── */}
      {!loading && org?.billing && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">
            Billing &amp; Subscription
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Plan
              </p>
              <p className="mt-1">{planBadge(org.plan)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Subscription ID
              </p>
              <p className="mt-1 truncate text-sm font-mono text-content-faint">
                {org.billing.subscriptionId || "None"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Customer ID
              </p>
              <p className="mt-1 truncate text-sm font-mono text-content-faint">
                {org.billing.customerId || "None"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Current Period End
              </p>
              <p className="mt-1 text-sm text-content-faint">
                {org.billing.currentPeriodEnd
                  ? formatDate(org.billing.currentPeriodEnd)
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Usage Stats ── */}
      {!loading && org && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">
            Usage This Period ({org.usageStats.period})
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                MCP Queries
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-content">
                {org.usageStats.mcpQueries.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Playwright Runs
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-content">
                {org.usageStats.playwrightRuns.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                Last Audit
              </p>
              <p className="mt-1 text-lg font-bold text-content">
                {org.lastAudit ? timeAgo(org.lastAudit.date) : "Never"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
