"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import CustomSelect from "@/components/console/CustomSelect";

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
  orgType: "customer" | "demo" | "trial";
  trialEndsAt: string | null;
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
  auditHistory: AuditHistoryRow[];
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

interface PlanOption {
  key: string;
  label: string;
}

interface AuditHistoryRow {
  id: string;
  environmentId: string;
  environmentDomain: string | null;
  status: string;
  cycleType: string;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
  retryCount: number;
  findingCount: number;
  evidenceCount: number;
  actionCount: number | null;
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
  const t = useTranslations("console.admin.org_detail");
  const params = useParams();
  const { data: session } = useSession();

  const orgId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Plan/type editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [editPlan, setEditPlan] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "pending" | "suspended">("active");
  const [editOrgType, setEditOrgType] = useState<"customer" | "demo" | "trial">("customer");
  const [editTrialEndsAt, setEditTrialEndsAt] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || t("failed_to_load"));
        return;
      }
      const data = await res.json();
      setOrg(data.organization);
    } catch {
      setError(t("failed_to_load"));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  /* ---------- Actions ---------- */

  async function handleSuspend() {
    if (!org) return;
    const isSuspended = org.status === "suspended";
    const confirmMsg = isSuspended
      ? t("confirm_reactivate", { name: org.name })
      : t("confirm_suspend", { name: org.name });
    const failMsg = isSuspended ? t("failed_to_reactivate") : t("failed_to_suspend");
    if (!confirm(confirmMsg)) return;

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
        alert(data.message || failMsg);
      }
    } catch {
      alert(failMsg);
    } finally {
      setActionLoading(false);
    }
  }

  function openEditor() {
    if (!org) return;
    setEditPlan(org.plan);
    setEditStatus((org.status as any) || "active");
    setEditOrgType(org.orgType || "customer");
    setEditTrialEndsAt(
      org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "",
    );
    setSaveError(null);
    setEditorOpen(true);

    // Lazy-load plan options the first time the editor is opened.
    if (planOptions.length === 0) {
      fetch("/api/admin/pricing")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.plans) {
            setPlanOptions(
              data.plans.map((p: any) => ({ key: p.key, label: p.label })),
            );
          }
        })
        .catch(() => {
          /* ignore — the select falls back to whatever plan the org currently has */
        });
    }
  }

  async function handleSaveEdits() {
    if (!org) return;
    setSaveError(null);

    const payload: Record<string, any> = {};
    if (editPlan && editPlan !== org.plan) payload.plan = editPlan;
    if (editStatus && editStatus !== org.status) payload.status = editStatus;
    if (editOrgType && editOrgType !== org.orgType) payload.orgType = editOrgType;

    // Hard confirm when changing plan on an org with a live Paddle/Stripe
    // subscription. The PATCH only writes Organization.plan — it does not
    // call the billing provider. Letting an admin silently flip a Max org
    // to Pro (or vice versa) creates a feature-vs-invoice mismatch the
    // customer will eventually notice on their next bill. Force an
    // explicit acknowledgment so the admin reaches for the proper path
    // (Paddle dashboard / Stripe customer portal) when it matters.
    if (
      payload.plan &&
      org.billing?.subscriptionId &&
      !confirm(
        t("confirm_plan_change", {
          subscriptionId: org.billing.subscriptionId,
          currentPlan: org.plan,
        }),
      )
    ) {
      return;
    }

    // Trial date: only send when orgType is trial, or when clearing
    const currentTrialIso = org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "";
    if (editOrgType === "trial") {
      if (!editTrialEndsAt) {
        setSaveError(t("trial_end_required"));
        return;
      }
      if (editTrialEndsAt !== currentTrialIso) {
        payload.trialEndsAt = new Date(editTrialEndsAt).toISOString();
      }
    } else if (org.orgType === "trial") {
      // Dropping out of trial — clear the end date. (editOrgType is
      // already narrowed to "demo" | "customer" by the enclosing if.)
      payload.trialEndsAt = null;
    }

    if (Object.keys(payload).length === 0) {
      setEditorOpen(false);
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.message || t("failed_to_update"));
        return;
      }
      await fetchOrg();
      setEditorOpen(false);
    } catch {
      setSaveError(t("failed_to_update"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleImpersonate() {
    if (!org) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || t("failed_find_owner"));
        return;
      }

      const adminEmail = session?.user?.email;
      if (!adminEmail) {
        alert(t("could_not_determine_admin"));
        return;
      }

      const result = await signIn("impersonate", {
        redirect: false,
        adminEmail,
        userEmail: data.email,
      });

      if (result?.error) {
        alert(t("impersonation_failed_with_reason", { reason: result.error }));
      } else {
        window.location.href = "/app";
      }
    } catch {
      alert(t("impersonation_failed"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTriggerAudit() {
    if (!org) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/trigger-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Surface override side-effects so the operator knows whether
        // their click actually replaced a scheduled hot/warm or just
        // queued the full behind one that is already running.
        const parts: string[] = [
          data.message || t("audit_cycle_started", { cycleId: data.cycleId }),
        ];
        if (data.cancelledPending && data.cancelledPending > 0) {
          parts.push(`(cancelled ${data.cancelledPending} pending hot/warm)`);
        }
        if (data.queuedBehind) {
          parts.push(`(will start after ${data.queuedBehind.cycleType} ${data.queuedBehind.id})`);
        }
        alert(parts.join("\n"));
      } else {
        alert(data.message || t("failed_to_trigger_audit"));
      }
    } catch {
      alert(t("failed_to_trigger_audit"));
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
          {t("back_to_organizations")}
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
          {t("back_to_organizations")}
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
                {t("created_on", { date: formatDate(org.createdAt) })} &middot;{" "}
                {t("last_updated", { when: timeAgo(org.updatedAt) })}
              </p>
            </>
          ) : null}
        </div>

        {/* Action buttons */}
        {!loading && org && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={openEditor}
              disabled={actionLoading}
              className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
            >
              {t("edit_plan_type")}
            </button>
            <button
              onClick={handleSuspend}
              disabled={actionLoading}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                org.status === "suspended"
                  ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              }`}
            >
              {org.status === "suspended" ? t("reactivate") : t("suspend")}
            </button>
            <button
              onClick={handleTriggerAudit}
              disabled={actionLoading}
              className="rounded-lg border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {t("run_full_audit")}
            </button>
            <button
              onClick={handleImpersonate}
              disabled={actionLoading}
              className="rounded-lg border border-accent/30 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/10 disabled:opacity-50"
            >
              {t("impersonate")}
            </button>
          </div>
        )}
      </div>

      {/* ── Plan / Type Editor (inline) ── */}
      {editorOpen && org && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content">
              {t("editor_title")}
            </h2>
            <p className="text-xs text-content-faint">
              {t("editor_description")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("label_plan")}
              </label>
              <CustomSelect
                value={editPlan}
                onChange={setEditPlan}
                options={
                  planOptions.length === 0
                    ? [{ value: org.plan, label: org.plan }]
                    : planOptions.map((p) => ({
                        value: p.key,
                        label: p.label,
                      }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("label_status")}
              </label>
              <CustomSelect
                value={editStatus}
                onChange={(val) => setEditStatus(val as "active" | "pending" | "suspended")}
                options={[
                  { value: "active", label: t("status_active") },
                  { value: "pending", label: t("status_pending") },
                  { value: "suspended", label: t("status_suspended") },
                ]}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("label_org_type")}
              </label>
              <CustomSelect
                value={editOrgType}
                onChange={(val) => setEditOrgType(val as "customer" | "demo" | "trial")}
                options={[
                  { value: "customer", label: t("type_customer") },
                  { value: "trial", label: t("type_trial") },
                  { value: "demo", label: t("type_demo") },
                ]}
              />
            </div>

            {editOrgType === "trial" && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  {t("label_trial_ends_at")}
                </label>
                <input
                  type="date"
                  value={editTrialEndsAt}
                  onChange={(e) => setEditTrialEndsAt(e.target.value)}
                  className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            )}
          </div>

          {saveError && (
            <p className="mt-3 text-xs text-red-400">{saveError}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setEditorOpen(false)}
              disabled={actionLoading}
              className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleSaveEdits}
              disabled={actionLoading}
              className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30 disabled:opacity-50"
            >
              {actionLoading ? t("saving") : t("save_changes")}
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("stat_members")}
          value={org ? String(org.members.length) : "0"}
          sub={
            org
              ? t("stat_members_sub", {
                  owners: org.members.filter((m) => m.role === "owner").length,
                  admins: org.members.filter((m) => m.role === "admin").length,
                })
              : undefined
          }
          icon={icons.users}
          loading={loading}
        />
        <StatCard
          label={t("stat_environments")}
          value={org ? String(org.environments.length) : "0"}
          sub={
            org
              ? t("stat_environments_sub", { count: org.environments.filter((e) => e.isProduction).length })
              : undefined
          }
          icon={icons.globe}
          loading={loading}
        />
        <StatCard
          label={t("stat_mcp_queries")}
          value={org ? String(org.usageStats.mcpQueries) : "0"}
          sub={org ? t("stat_period", { period: org.usageStats.period }) : undefined}
          icon={icons.bolt}
          accent
          loading={loading}
        />
        <StatCard
          label={t("stat_last_audit")}
          value={
            org
              ? org.lastAudit
                ? formatDate(org.lastAudit.date)
                : t("never")
              : "--"
          }
          sub={
            org && org.lastAudit
              ? t("status_label", { status: org.lastAudit.status })
              : org
                ? t("no_audits_run_yet")
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
              {t("members_section")}{org ? ` (${org.members.length})` : ""}
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
              {t("no_members_found")}
            </div>
          ) : org ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_name")}
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_email")}
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_role")}
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_joined")}
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
                            {member.name || t("unnamed")}
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
              {t("environments_section")}{org ? ` (${org.environments.length})` : ""}
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
              {t("no_environments_found")}
            </div>
          ) : org ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_domain")}
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_type")}
                    </th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                      {t("col_created")}
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
                            {t("production")}
                          </span>
                        ) : (
                          <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                            {t("staging")}
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
            {t("business_profile")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("business_model")}
              </p>
              <p className="mt-1 text-sm font-medium capitalize text-content">
                {org.businessProfile.businessModel.replace("_", " ")}
              </p>
            </div>
            {org.businessProfile.monthlyRevenue != null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                  {t("monthly_revenue")}
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
            {t("billing_subscription")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("plan_label")}
              </p>
              <p className="mt-1">{planBadge(org.plan)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("subscription_id")}
              </p>
              <p className="mt-1 truncate text-sm font-mono text-content-faint">
                {org.billing.subscriptionId || t("none")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("customer_id")}
              </p>
              <p className="mt-1 truncate text-sm font-mono text-content-faint">
                {org.billing.customerId || t("none")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("current_period_end")}
              </p>
              <p className="mt-1 text-sm text-content-faint">
                {org.billing.currentPeriodEnd
                  ? formatDate(org.billing.currentPeriodEnd)
                  : t("not_available")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Usage Stats ── */}
      {!loading && org && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">
            {t("usage_this_period", { period: org.usageStats.period })}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("mcp_queries")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-content">
                {org.usageStats.mcpQueries.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("playwright_runs")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-content">
                {org.usageStats.playwrightRuns.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("last_audit")}
              </p>
              <p className="mt-1 text-lg font-bold text-content">
                {org.lastAudit ? timeAgo(org.lastAudit.date) : t("never")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit History ── */}
      {!loading && org && <AuditHistoryCard rows={org.auditHistory} />}

      {/* ── Suppression Rules (admin-only operational tool) ── */}
      {!loading && org && (
        <SuppressionRulesCard
          organizationId={org.id}
          environments={org.environments}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Suppression Rules Card — admin-only operational tool
//
// Each rule reduces confidence of matching decisions during recompute
// (Phase 26). Rules NEVER hide findings — they record that we know a
// specific decision_key is a false positive for this env and bump
// confidence down with rationale. Creating a rule is ALSO a signal
// that the underlying detector needs tuning; tune at source then
// remove the rule.
//
// Not exposed to customers — customers shouldn't filter Vestigio's
// own output.
// ──────────────────────────────────────────────

interface SuppressionRule {
  id: string;
  scopeRef: string;
  scopeKind: "workspace" | "environment";
  matchKey: string;
  reason: string;
  createdBy: string;
  expiresAt: string | null;
  reviewPolicy: "manual" | "auto_expire" | "permanent";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function SuppressionRulesCard({
  organizationId,
  environments,
}: {
  organizationId: string;
  environments: OrgEnvironment[];
}) {
  const [rules, setRules] = useState<SuppressionRule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formEnvId, setFormEnvId] = useState<string>(environments[0]?.id ?? "");
  const [formMatchKey, setFormMatchKey] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formPolicy, setFormPolicy] = useState<
    "manual" | "auto_expire" | "permanent"
  >("auto_expire");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/suppressions?organizationId=${organizationId}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRules(data.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const envLabel = useCallback(
    (scopeRef: string) => {
      if (scopeRef.startsWith("workspace:")) return "All envs (workspace)";
      const envId = scopeRef.slice("environment:".length);
      const env = environments.find((e) => e.id === envId);
      return env ? env.domain : envId.slice(0, 8);
    },
    [environments],
  );

  const submit = async () => {
    if (!formEnvId || !formMatchKey.trim() || formReason.trim().length < 5) {
      setError("env, matchKey, and reason (5+ chars) are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: formEnvId,
          matchKey: formMatchKey.trim(),
          reason: formReason.trim(),
          reviewPolicy: formPolicy,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${r.status}`);
      }
      setFormMatchKey("");
      setFormReason("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (rule: SuppressionRule) => {
    try {
      const r = await fetch(`/api/admin/suppressions/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const deleteRule = async (rule: SuppressionRule) => {
    if (
      !window.confirm(
        `Delete suppression rule for "${rule.matchKey}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/admin/suppressions/${rule.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const ruleCount = rules?.length ?? 0;
  const activeCount = rules?.filter((r) => r.isActive).length ?? 0;

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      <div className="flex items-start justify-between border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-content">
            Suppression Rules
            {ruleCount > 0 && (
              <span className="ml-2 text-xs font-normal text-content-faint">
                {activeCount} active / {ruleCount} total
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-content-faint">
            Reduce confidence of matching decisions (never hide). Each rule
            is a signal the underlying detector needs tuning.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded border border-edge bg-surface-inset px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-card-hover"
        >
          {showForm ? "Cancel" : "New rule"}
        </button>
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/5 px-5 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <div className="space-y-3 border-b border-edge bg-surface-inset/40 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-content-muted">Environment</span>
              <select
                value={formEnvId}
                onChange={(e) => setFormEnvId(e.target.value)}
                className="rounded border border-edge bg-surface-card px-2 py-1.5 text-content"
              >
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.domain}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-content-muted">
                Match key (decision_key)
              </span>
              <input
                value={formMatchKey}
                onChange={(e) => setFormMatchKey(e.target.value)}
                placeholder="e.g. checkout_pricing_consistency"
                className="rounded border border-edge bg-surface-card px-2 py-1.5 font-mono text-xs text-content"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-content-muted">Review policy</span>
              <select
                value={formPolicy}
                onChange={(e) =>
                  setFormPolicy(
                    e.target.value as "manual" | "auto_expire" | "permanent",
                  )
                }
                className="rounded border border-edge bg-surface-card px-2 py-1.5 text-content"
              >
                <option value="auto_expire">auto_expire (90d default)</option>
                <option value="manual">manual</option>
                <option value="permanent">permanent</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-content-muted">
              Reason (why this is a false positive + linked ticket if any)
            </span>
            <textarea
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer uses a custom CMS that exposes /admin but it's behind an SSO gate not visible to our crawler. Tracking detector fix in #1234."
              className="rounded border border-edge bg-surface-card px-2 py-1.5 text-content"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create rule"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-content-faint">
          Loading…
        </div>
      ) : !rules || rules.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-content-faint">
          No suppression rules. Use this only for clear false positives — tune
          the detector at source as the durable fix.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Env
                </th>
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Match key
                </th>
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Reason
                </th>
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Policy
                </th>
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Expires
                </th>
                <th className="px-5 py-3 font-medium uppercase tracking-wider text-content-muted">
                  Active
                </th>
                <th className="px-5 py-3 text-right font-medium uppercase tracking-wider text-content-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {rules.map((r) => {
                const expired =
                  r.expiresAt !== null && new Date(r.expiresAt).getTime() <= Date.now();
                return (
                  <tr key={r.id} className="hover:bg-surface-card-hover">
                    <td className="px-5 py-3 text-content-secondary">
                      {envLabel(r.scopeRef)}
                    </td>
                    <td className="px-5 py-3 font-mono text-content">
                      {r.matchKey}
                    </td>
                    <td className="px-5 py-3 text-content-secondary">
                      <span className="line-clamp-2 max-w-md">{r.reason}</span>
                    </td>
                    <td className="px-5 py-3 text-content-muted">
                      {r.reviewPolicy}
                    </td>
                    <td className="px-5 py-3 text-content-muted">
                      {r.expiresAt
                        ? `${formatDate(r.expiresAt)}${expired ? " (expired)" : ""}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(r)}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          r.isActive
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-surface-inset text-content-muted"
                        }`}
                      >
                        {r.isActive ? "active" : "inactive"}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteRule(r)}
                        className="text-[10px] text-red-400 underline hover:text-red-300"
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Audit History Card
//
// Per-cycle outcome at a glance: status, duration, finding + action +
// evidence counts, and the lastError text when a run fails. Useful for
// spotting regressions ("env X consistently fails after deploys") and
// support flows ("did the run actually complete? how many findings?")
// without opening the runner logs.
// ──────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function auditStatusBadge(status: string) {
  const base = "rounded px-1.5 py-0.5 text-[10px] font-medium";
  switch (status) {
    case "complete":
      return <span className={`${base} bg-emerald-500/10 text-emerald-400`}>complete</span>;
    case "failed":
      return <span className={`${base} bg-red-500/10 text-red-400`}>failed</span>;
    case "running":
      return <span className={`${base} bg-blue-500/10 text-blue-400`}>running</span>;
    case "pending":
      return <span className={`${base} bg-amber-500/10 text-amber-400`}>pending</span>;
    default:
      return <span className={`${base} bg-surface-inset text-content-muted`}>{status}</span>;
  }
}

function AuditHistoryCard({ rows }: { rows: AuditHistoryRow[] }) {
  const t = useTranslations("console.admin.org_detail");
  const [expandedError, setExpandedError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      <div className="border-b border-edge px-5 py-4">
        <h2 className="text-sm font-semibold text-content">
          {rows.length > 0 ? t("audit_history_last", { count: rows.length }) : t("audit_history")}
        </h2>
        <p className="mt-0.5 text-xs text-content-faint">
          {t("audit_history_description")}
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-content-faint">
          {t("no_audits_run_yet")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_when")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_env")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_type")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_status")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_duration")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_findings")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_actions")}</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_evidence")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_notes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {rows.map((row) => {
                const isExpanded = expandedError === row.id;
                const hasError = Boolean(row.lastError);
                return (
                  <>
                    <tr key={row.id} className="transition-colors hover:bg-surface-card-hover">
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-xs font-medium text-content">{timeAgo(row.createdAt)}</p>
                          <p className="text-[10px] text-content-faint">{formatDate(row.createdAt)}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="truncate text-xs text-content-secondary">
                          {row.environmentDomain || row.environmentId.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-content-muted">
                          {row.cycleType}
                        </span>
                      </td>
                      <td className="px-5 py-3">{auditStatusBadge(row.status)}</td>
                      <td className="px-5 py-3 text-right text-xs font-mono text-content-muted">
                        {formatDuration(row.durationMs)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-mono tabular-nums text-content">
                        {row.findingCount}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-mono tabular-nums text-content">
                        {row.actionCount ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-mono tabular-nums text-content-muted">
                        {row.evidenceCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {row.retryCount > 0 && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                              {t("retry_count", { count: row.retryCount })}
                            </span>
                          )}
                          {hasError && (
                            <button
                              type="button"
                              onClick={() => setExpandedError(isExpanded ? null : row.id)}
                              className="text-[10px] text-red-400 underline hover:text-red-300"
                            >
                              {isExpanded ? t("hide_error") : t("view_error")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && hasError && (
                      <tr key={`${row.id}-error`} className="bg-red-500/5">
                        <td colSpan={9} className="px-5 py-3">
                          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                              lastError {row.lastErrorAt ? `(${timeAgo(row.lastErrorAt)})` : ""}
                            </p>
                            <pre className="whitespace-pre-wrap break-words text-xs text-red-300">
                              {row.lastError}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
