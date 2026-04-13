"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Organization — full management page
//
// Fetches org details, environments, members,
// and business profile from /api/organization.
// Supports inline editing for org name and
// business profile fields.
// ──────────────────────────────────────────────

interface OrgData {
  organization: {
    id: string;
    name: string;
    ownerId: string;
    plan: string;
    status: string;
    createdAt: string;
  };
  environments: {
    id: string;
    domain: string;
    landingUrl: string;
    isProduction: boolean;
    createdAt: string;
  }[];
  members: {
    id: string;
    userId: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
    createdAt: string;
  }[];
  businessProfile: {
    id: string;
    businessModel: string;
    monthlyRevenue: number | null;
    averageOrderValue: number | null;
    monthlyTransactions: number | null;
    conversionRate: number | null;
    conversionModel: string;
  } | null;
  currentUserRole: string;
}

const PLAN_LABELS: Record<string, string> = {
  vestigio: "Vestigio",
  pro: "Pro",
  max: "Max",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

const BUSINESS_MODEL_LABELS: Record<string, string> = {
  ecommerce: "E-Commerce",
  lead_gen: "Lead Generation",
  saas: "SaaS",
  hybrid: "Hybrid",
};

const CONVERSION_MODEL_LABELS: Record<string, string> = {
  checkout: "Checkout",
  whatsapp: "WhatsApp",
  form: "Form",
  external: "External",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "--";
  return `${value}%`;
}

// ── Spinner ──
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Add Environment Modal ──
function AddEnvironmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("console.organization");
  const [domain, setDomain] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/organization/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, isProduction }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Failed to create environment");
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-edge bg-surface-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-content">{t("add_env_title")}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-content-muted">{t("domain_label")}</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder={t("domain_placeholder")}
              className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              required
              minLength={3}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={isProduction}
              onChange={(e) => setIsProduction(e.target.checked)}
              className="h-4 w-4 rounded border-edge bg-surface-inset text-emerald-500 focus:ring-emerald-500"
            />
            {t("production_env")}
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving && <Spinner />}
              {t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function OrganizationPage() {
  const t = useTranslations("console.organization");
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editable state
  const [editName, setEditName] = useState("");
  const [editBusinessModel, setEditBusinessModel] = useState("");
  const [editMonthlyRevenue, setEditMonthlyRevenue] = useState("");
  const [editAov, setEditAov] = useState("");
  const [editMonthlyTxns, setEditMonthlyTxns] = useState("");
  const [editConversionRate, setEditConversionRate] = useState("");
  const [editConversionModel, setEditConversionModel] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showAddEnv, setShowAddEnv] = useState(false);
  const [deletingEnv, setDeletingEnv] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);

  const isOwnerOrAdmin = data?.currentUserRole === "owner" || data?.currentUserRole === "admin";
  const isOwner = data?.currentUserRole === "owner";

  const fetchData = useCallback(async () => {
    try {
      setError("");
      const res = await fetch("/api/organization");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || "Failed to load organization data");
        return;
      }
      const json: OrgData = await res.json();
      setData(json);

      // Populate editable fields
      setEditName(json.organization.name);
      setEditBusinessModel(json.businessProfile?.businessModel || "ecommerce");
      setEditMonthlyRevenue(json.businessProfile?.monthlyRevenue?.toString() || "");
      setEditAov(json.businessProfile?.averageOrderValue?.toString() || "");
      setEditMonthlyTxns(json.businessProfile?.monthlyTransactions?.toString() || "");
      setEditConversionRate(json.businessProfile?.conversionRate?.toString() || "");
      setEditConversionModel(json.businessProfile?.conversionModel || "checkout");
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const payload: Record<string, any> = {};

    if (editName !== data.organization.name) {
      payload.name = editName;
    }

    const bp = data.businessProfile;
    if (editBusinessModel !== (bp?.businessModel || "ecommerce")) payload.businessModel = editBusinessModel;
    if (editMonthlyRevenue !== (bp?.monthlyRevenue?.toString() || "")) {
      payload.monthlyRevenue = editMonthlyRevenue ? parseFloat(editMonthlyRevenue) : null;
    }
    if (editAov !== (bp?.averageOrderValue?.toString() || "")) {
      payload.averageOrderValue = editAov ? parseFloat(editAov) : null;
    }
    if (editMonthlyTxns !== (bp?.monthlyTransactions?.toString() || "")) {
      payload.monthlyTransactions = editMonthlyTxns ? parseInt(editMonthlyTxns, 10) : null;
    }
    if (editConversionRate !== (bp?.conversionRate?.toString() || "")) {
      payload.conversionRate = editConversionRate ? parseFloat(editConversionRate) : null;
    }
    if (editConversionModel !== (bp?.conversionModel || "checkout")) payload.conversionModel = editConversionModel;

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return;
    }

    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.message || "Failed to save changes");
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      await fetchData();
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEnv(envId: string) {
    if (!confirm("Are you sure you want to delete this environment? This action cannot be undone.")) return;
    setDeletingEnv(envId);

    try {
      const res = await fetch("/api/organization/environments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId: envId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.message || "Failed to delete environment");
        return;
      }

      await fetchData();
    } catch {
      alert("Network error");
    } finally {
      setDeletingEnv(null);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setDeletingMember(membershipId);

    try {
      const res = await fetch("/api/organization/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.message || "Failed to remove member");
        return;
      }

      await fetchData();
    } catch {
      alert("Network error");
    } finally {
      setDeletingMember(null);
    }
  }

  // ── Loading State ──
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="flex items-center gap-3 text-content-muted">
          <Spinner />
          <span className="text-sm">{t("loading")}</span>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
          <p className="mt-1 text-sm text-content-muted">
            {t("subtitle")}
          </p>
        </div>
        <div className="rounded-lg border border-edge bg-surface-card px-6 py-12 text-center">
          <p className="text-sm text-content-muted">{error || "No organization data available."}</p>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  const { organization, environments, members, businessProfile } = data;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
          <p className="mt-1 text-sm text-content-muted">
            {t("subtitle")}
          </p>
        </div>
        {isOwnerOrAdmin && (
          <div className="flex items-center gap-3">
            {saveError && <span className="text-sm text-red-400">{saveError}</span>}
            {saveSuccess && <span className="text-sm text-emerald-400">{t("saved")}</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving && <Spinner />}
              {t("save_changes")}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── Left Column ─── */}
        <div className="space-y-6">
          {/* Org Details */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
              {t("details")}
            </h2>
            <div className="space-y-3">
              {/* Editable name */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-muted">{t("org_name")}</span>
                {isOwnerOrAdmin ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-48 rounded-md border border-edge bg-surface-inset px-2 py-1 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                ) : (
                  <span className="text-sm text-content-secondary">{organization.name}</span>
                )}
              </div>

              {/* Plan badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-muted">{t("plan")}</span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  {PLAN_LABELS[organization.plan] || organization.plan}
                </span>
              </div>

              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-muted">{t("status")}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[organization.status] || "bg-surface-card-hover text-content-secondary"}`}
                >
                  {organization.status}
                </span>
              </div>

              {/* Created */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-muted">{t("created")}</span>
                <span className="text-sm text-content-secondary">{formatDate(organization.createdAt)}</span>
              </div>
            </div>
          </section>

          {/* Business Profile */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
              {t("business_profile")}
            </h2>
            {isOwnerOrAdmin ? (
              <div className="space-y-3">
                {/* Business Model */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("business_model")}</span>
                  <select
                    value={editBusinessModel}
                    onChange={(e) => setEditBusinessModel(e.target.value)}
                    className="w-48 rounded-md border border-edge bg-surface-inset px-2 py-1 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    {Object.entries(BUSINESS_MODEL_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Monthly Revenue */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("monthly_revenue")}</span>
                  <div className="relative w-48">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-content-muted">$</span>
                    <input
                      type="number"
                      value={editMonthlyRevenue}
                      onChange={(e) => setEditMonthlyRevenue(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-edge bg-surface-inset py-1 pl-6 pr-2 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Average Order Value */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("avg_order_value")}</span>
                  <div className="relative w-48">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-content-muted">$</span>
                    <input
                      type="number"
                      value={editAov}
                      onChange={(e) => setEditAov(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-edge bg-surface-inset py-1 pl-6 pr-2 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Monthly Transactions */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("monthly_transactions")}</span>
                  <input
                    type="number"
                    value={editMonthlyTxns}
                    onChange={(e) => setEditMonthlyTxns(e.target.value)}
                    placeholder="0"
                    className="w-48 rounded-md border border-edge bg-surface-inset px-2 py-1 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Conversion Rate */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("conversion_rate")}</span>
                  <div className="relative w-48">
                    <input
                      type="number"
                      step="0.01"
                      value={editConversionRate}
                      onChange={(e) => setEditConversionRate(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-edge bg-surface-inset py-1 pl-2 pr-6 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-content-muted">%</span>
                  </div>
                </div>

                {/* Conversion Model */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("conversion_model")}</span>
                  <select
                    value={editConversionModel}
                    onChange={(e) => setEditConversionModel(e.target.value)}
                    className="w-48 rounded-md border border-edge bg-surface-inset px-2 py-1 text-right text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    {Object.entries(CONVERSION_MODEL_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("business_model")}</span>
                  <span className="text-sm text-content-secondary">
                    {BUSINESS_MODEL_LABELS[businessProfile?.businessModel || ""] || "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("monthly_revenue")}</span>
                  <span className="text-sm text-content-secondary">{formatCurrency(businessProfile?.monthlyRevenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("avg_order_value")}</span>
                  <span className="text-sm text-content-secondary">{formatCurrency(businessProfile?.averageOrderValue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("monthly_transactions")}</span>
                  <span className="text-sm text-content-secondary">{formatNumber(businessProfile?.monthlyTransactions)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("conversion_rate")}</span>
                  <span className="text-sm text-content-secondary">{formatPercent(businessProfile?.conversionRate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">{t("conversion_model")}</span>
                  <span className="text-sm text-content-secondary">
                    {CONVERSION_MODEL_LABELS[businessProfile?.conversionModel || ""] || "--"}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ─── Right Column ─── */}
        <div className="space-y-6">
          {/* Environments */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
                {t("environments")}
              </h2>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowAddEnv(true)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  {t("add")}
                </button>
              )}
            </div>

            {environments.length === 0 ? (
              <div className="rounded-md border border-edge px-4 py-6 text-center">
                <p className="text-sm text-content-muted">{t("no_environments")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {environments.map((env) => (
                  <div
                    key={env.id}
                    className="flex items-center justify-between rounded-md border border-edge bg-surface-inset px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-content-secondary">{env.domain}</span>
                        {env.isProduction && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                            {t("production")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-content-muted">{t("added_date", { date: formatDate(env.createdAt) })}</p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDeleteEnv(env.id)}
                        disabled={deletingEnv === env.id}
                        className="ml-3 shrink-0 rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      >
                        {deletingEnv === env.id ? "..." : t("remove")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Members */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
                {t("members")}
              </h2>
              <span className="text-xs text-content-muted">{t("member_count", { count: members.length })}</span>
            </div>

            {members.length === 0 ? (
              <div className="rounded-md border border-edge px-4 py-6 text-center">
                <p className="text-sm text-content-muted">{t("no_members")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-edge">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-surface-card">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                        {t("col_member")}
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                        {t("col_role")}
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                        {t("col_joined")}
                      </th>
                      {isOwner && (
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                          {t("col_actions")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b border-edge/50 last:border-b-0">
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-content-secondary">
                              {member.name || t("unnamed")}
                            </div>
                            <div className="text-xs text-content-muted">{member.email}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              member.role === "owner"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : member.role === "admin"
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-surface-card-hover/50 text-content-muted"
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-content-muted">
                          {formatDate(member.createdAt)}
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3">
                            {member.role !== "owner" ? (
                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={deletingMember === member.id}
                                className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                              >
                                {deletingMember === member.id ? "..." : t("remove")}
                              </button>
                            ) : (
                              <span className="text-xs text-content-faint">--</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Add Environment Modal */}
      {showAddEnv && (
        <AddEnvironmentModal
          onClose={() => setShowAddEnv(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}
