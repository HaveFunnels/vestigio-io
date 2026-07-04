"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import CustomSelect from "@/components/console/CustomSelect";

// ──────────────────────────────────────────────
// Admin — Create Organization
//
// Admin-driven provisioning flow for demos, trials, or comp'd accounts
// that shouldn't go through the Stripe/Paddle self-serve funnel.
//
// Creates Org + owner User (if new) + Membership + Environment +
// BusinessProfile in one shot via POST /api/admin/organizations.
// After creation the admin can impersonate the owner to finish
// setup from inside the org's own console.
// ──────────────────────────────────────────────

interface PlanOption {
  key: string;
  label: string;
  monthlyPriceCents: number;
}

function arrowLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

export default function AdminCreateOrganizationPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("console.admin.new_organization");

  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [orgType, setOrgType] = useState<"customer" | "demo" | "trial">("customer");
  const [status, setStatus] = useState<"active" | "pending" | "suspended">("active");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  // Toggle-gated block. Default OFF — admin creates a shell; owner fills
  // env + BusinessProfile during onboarding after impersonation. The owner
  // has the real business numbers that calibrate impact findings, so
  // shell mode is the preferred path. Admin can flip this ON for
  // one-shot setup when they have trustworthy data from a sales convo.
  const [provisionEnv, setProvisionEnv] = useState(false);
  const [domain, setDomain] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [isProduction, setIsProduction] = useState(true);
  const [businessModel, setBusinessModel] = useState<"ecommerce" | "lead_gen" | "saas" | "hybrid">("ecommerce");
  const [conversionModel, setConversionModel] = useState<"checkout" | "whatsapp" | "form" | "external">("checkout");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [averageOrderValue, setAverageOrderValue] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrg, setCreatedOrg] = useState<{
    id: string;
    name: string;
    ownerEmail: string;
    ownerId: string;
    ownerCreated: boolean;
  } | null>(null);
  const [resendingActivation, setResendingActivation] = useState(false);
  const [activationResent, setActivationResent] = useState(false);

  // ── Load plan options on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/pricing");
        if (res.ok) {
          const data = await res.json();
          const opts: PlanOption[] = (data.plans || []).map((p: any) => ({
            key: p.key,
            label: p.label,
            monthlyPriceCents: p.monthlyPriceCents,
          }));
          setPlans(opts);
          if (opts.length > 0 && !plan) setPlan(opts[0].key);
        }
      } catch {
        /* ignore */
      } finally {
        setPlansLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): string | null {
    if (!name.trim()) return t("err_name_required");
    if (!plan) return t("err_plan_required");
    if (!ownerEmail.trim()) return t("err_email_required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim())) {
      return t("err_email_invalid");
    }
    if (orgType === "trial" && !trialEndsAt) {
      return t("err_trial_date_required");
    }
    if (provisionEnv && !domain.trim()) {
      return t("err_domain_required");
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        plan,
        orgType,
        status,
        ownerEmail: ownerEmail.trim(),
        ownerName: ownerName.trim() || null,
      };
      if (orgType === "trial") body.trialEndsAt = new Date(trialEndsAt).toISOString();
      // Only include env/business fields when provisioned mode is explicitly
      // enabled — sending empty strings would trip the backend validation.
      if (provisionEnv) {
        body.domain = domain.trim();
        body.landingUrl = landingUrl.trim() || null;
        body.isProduction = isProduction;
        body.businessModel = businessModel;
        body.conversionModel = conversionModel;
        if (monthlyRevenue) body.monthlyRevenue = Number(monthlyRevenue);
        if (averageOrderValue) body.averageOrderValue = Number(averageOrderValue);
      }

      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("err_create_failed"));
        return;
      }

      setCreatedOrg({
        id: data.organization.id,
        name: data.organization.name,
        ownerEmail: data.owner.email,
        ownerId: data.owner.id,
        ownerCreated: data.owner.created,
      });
      setActivationResent(false);
    } catch {
      setError(t("err_create_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImpersonate() {
    if (!createdOrg) return;
    if (!confirm(`Sign in as owner of "${createdOrg.name}"?\n\nYou will be signed out of your admin session.`)) {
      return;
    }

    // Mint an impersonation token via the admin-gated endpoint. The
    // requireAdmin() gate on that route is the auth check; the
    // password prompt this component used to show was a UX affordance
    // — the CredentialsProvider never actually verified it. Replaced
    // with a confirm() so the "you will be signed out" warning still
    // fires without pretending a password re-check is happening.
    const mintRes = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: createdOrg.id }),
    });
    const mintData = await mintRes.json();
    if (!mintRes.ok || !mintData.token) {
      alert(`Impersonation failed: ${mintData.message ?? "no token"}`);
      return;
    }

    const result = await signIn("impersonate", {
      redirect: false,
      token: mintData.token,
    });

    if (result?.error) {
      alert(`Impersonation failed: ${result.error}`);
    } else {
      window.location.href = "/app";
    }
  }

  // ── Success state ──
  if (createdOrg) {
    return (
      <div className="space-y-6 p-6">
        <Link
          href="/app/admin/organizations"
          className="inline-flex items-center gap-2 text-sm text-content-muted transition-colors hover:text-content"
        >
          {arrowLeftIcon()}
          {t("back_to_orgs")}
        </Link>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6">
          <h1 className="text-lg font-semibold text-content">
            {t("org_created")}
          </h1>
          <p className="mt-2 text-sm text-content-muted">
            <span className="font-medium text-content">{createdOrg.name}</span>{" "}
            {createdOrg.ownerCreated
              ? t("owner_created_msg", { email: createdOrg.ownerEmail })
              : t("owner_existing_msg", { email: createdOrg.ownerEmail })}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleImpersonate}
              className="rounded-lg border border-accent/30 bg-accent-subtle-bg/5 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/10"
            >
              {t("sign_in_as_owner")}
            </button>
            {createdOrg.ownerCreated && (
              <button
                onClick={async () => {
                  setResendingActivation(true);
                  try {
                    const res = await fetch("/api/admin/organizations/resend-activation", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: createdOrg.ownerId, domain: domain || createdOrg.name }),
                    });
                    if (res.ok) {
                      setActivationResent(true);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      alert(data.message || "Failed to resend");
                    }
                  } catch {
                    alert("Network error");
                  } finally {
                    setResendingActivation(false);
                  }
                }}
                disabled={resendingActivation || activationResent}
                className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
              >
                {activationResent ? t("activation_resent") : resendingActivation ? t("sending") : t("resend_activation")}
              </button>
            )}
            <Link
              href={`/app/admin/organizations/${createdOrg.id}`}
              className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
            >
              {t("open_org_detail")}
            </Link>
            <button
              onClick={() => {
                setCreatedOrg(null);
                setName("");
                setOwnerEmail("");
                setOwnerName("");
                setDomain("");
                setLandingUrl("");
                setMonthlyRevenue("");
                setAverageOrderValue("");
              }}
              className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
            >
              {t("create_another")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Back + Header ── */}
      <div>
        <Link
          href="/app/admin/organizations"
          className="inline-flex items-center gap-2 text-sm text-content-muted transition-colors hover:text-content"
        >
          {arrowLeftIcon()}
          {t("back_to_orgs")}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Organization ── */}
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">{t("organization")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("name_required")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={t("name_placeholder")}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("plan_required")}
              </label>
              <CustomSelect
                value={plan}
                onChange={setPlan}
                disabled={plansLoading}
                options={
                  plansLoading
                    ? [{ value: "", label: t("loading_plans") }]
                    : plans.length === 0
                      ? [{ value: "", label: t("no_plans") }]
                      : plans.map((p) => ({
                          value: p.key,
                          label: `${p.label} — $${(p.monthlyPriceCents / 100).toFixed(0)}/mo`,
                        }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("org_type")}
              </label>
              <CustomSelect
                value={orgType}
                onChange={(val) => setOrgType(val as "customer" | "demo" | "trial")}
                options={[
                  { value: "customer", label: t("org_type_customer") },
                  { value: "trial", label: t("org_type_trial") },
                  { value: "demo", label: t("org_type_demo") },
                ]}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("status")}
              </label>
              <CustomSelect
                value={status}
                onChange={(val) => setStatus(val as "active" | "pending" | "suspended")}
                options={[
                  { value: "active", label: t("status_active") },
                  { value: "pending", label: t("status_pending") },
                  { value: "suspended", label: t("status_suspended") },
                ]}
              />
            </div>

            {orgType === "trial" && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  {t("trial_ends_at")}
                </label>
                <input
                  type="date"
                  value={trialEndsAt}
                  onChange={(e) => setTrialEndsAt(e.target.value)}
                  required
                  className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Owner ── */}
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-content">{t("owner")}</h2>
          <p className="mb-4 text-xs text-content-faint">
            {t("owner_note")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("email_required")}
              </label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                placeholder={t("email_placeholder")}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("name")}
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={t("owner_name_placeholder")}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>
        </section>

        {/* ── Provisioning mode toggle ── */}
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={provisionEnv}
              onChange={(e) => setProvisionEnv(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-edge bg-surface-inset text-accent focus:ring-accent/30"
            />
            <span>
              <span className="block text-sm font-medium text-content">
                {t("provision_env_label")}
              </span>
              <span className="mt-0.5 block text-xs text-content-faint">
                {t("provision_env_help")}
              </span>
            </span>
          </label>
        </section>

        {/* ── Environment ── */}
        {provisionEnv && (
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">{t("initial_environment")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("domain_required")}
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                placeholder={t("domain_placeholder")}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              <p className="mt-1 text-xs text-content-faint">
                {t("domain_help")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("landing_url")}
              </label>
              <input
                type="text"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder="https://acme.com/checkout"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              <p className="mt-1 text-xs text-content-faint">
                {t("landing_url_help")} <span className="font-mono">https://{domain || "<domain>"}</span>
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-content-secondary">
                <input
                  type="checkbox"
                  checked={isProduction}
                  onChange={(e) => setIsProduction(e.target.checked)}
                  className="h-4 w-4 rounded border-edge bg-surface-inset text-accent focus:ring-accent/30"
                />
                {t("production_env")}
              </label>
            </div>
          </div>
        </section>
        )}

        {/* ── Business Profile ── */}
        {provisionEnv && (
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">{t("business_profile")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("business_model")}
              </label>
              <CustomSelect
                value={businessModel}
                onChange={(val) => setBusinessModel(val as "ecommerce" | "lead_gen" | "saas" | "hybrid")}
                options={[
                  { value: "ecommerce", label: t("business_ecommerce") },
                  { value: "lead_gen", label: t("business_lead_gen") },
                  { value: "saas", label: t("business_saas") },
                  { value: "hybrid", label: t("business_hybrid") },
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("conversion_model")}
              </label>
              <CustomSelect
                value={conversionModel}
                onChange={(val) => setConversionModel(val as "checkout" | "whatsapp" | "form" | "external")}
                options={[
                  { value: "checkout", label: t("conversion_checkout") },
                  { value: "whatsapp", label: t("conversion_whatsapp") },
                  { value: "form", label: t("conversion_form") },
                  { value: "external", label: t("conversion_external") },
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("monthly_revenue")}
              </label>
              <input
                type="number"
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                min={0}
                step="0.01"
                placeholder="50000"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                {t("average_order_value")}
              </label>
              <input
                type="number"
                value={averageOrderValue}
                onChange={(e) => setAverageOrderValue(e.target.value)}
                min={0}
                step="0.01"
                placeholder="150"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>
        </section>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Submit ── */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/app/admin/organizations")}
            className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30 disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("create_org")}
          </button>
        </div>
      </form>
    </div>
  );
}
