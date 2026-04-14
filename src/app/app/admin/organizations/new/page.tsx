"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

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
  } | null>(null);

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
    if (!name.trim()) return "Organization name is required";
    if (!plan) return "Plan is required";
    if (!ownerEmail.trim()) return "Owner email is required";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim())) {
      return "Owner email is not valid";
    }
    if (orgType === "trial" && !trialEndsAt) {
      return "Trial end date is required for trial orgs";
    }
    if (provisionEnv && !domain.trim()) {
      return "Domain is required when provisioning the environment inline";
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
        setError(data.message || "Failed to create organization");
        return;
      }

      setCreatedOrg({
        id: data.organization.id,
        name: data.organization.name,
        ownerEmail: data.owner.email,
      });
    } catch {
      setError("Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImpersonate() {
    if (!createdOrg) return;
    const adminPassword = prompt(
      `Enter your admin password to sign in as owner of "${createdOrg.name}".\n\nYou will be signed out of your admin session.`,
    );
    if (!adminPassword) return;

    const adminEmail = session?.user?.email;
    if (!adminEmail) {
      alert("Could not determine admin email");
      return;
    }

    const result = await signIn("impersonate", {
      redirect: false,
      adminEmail,
      adminPassword,
      userEmail: createdOrg.ownerEmail,
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
          Back to Organizations
        </Link>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6">
          <h1 className="text-lg font-semibold text-content">
            Organization created
          </h1>
          <p className="mt-2 text-sm text-content-muted">
            <span className="font-medium text-content">{createdOrg.name}</span> is
            ready. Owner <span className="font-mono text-content-secondary">{createdOrg.ownerEmail}</span>{" "}
            was created without a password — sign in as them via impersonation,
            or let the customer set one via password reset.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleImpersonate}
              className="rounded-lg border border-accent/30 bg-accent-subtle-bg/5 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/10"
            >
              Sign in as owner
            </button>
            <Link
              href={`/app/admin/organizations/${createdOrg.id}`}
              className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
            >
              Open organization detail
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
              Create another
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
          Back to Organizations
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-content">New Organization</h1>
        <p className="mt-1 text-sm text-content-muted">
          Provision an organization manually — for demos, trials, or comp&#39;d
          accounts that skip the Stripe/Paddle checkout flow.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Organization ── */}
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">Organization</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Acme Commerce"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Plan *
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                disabled={plansLoading}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              >
                {plansLoading ? (
                  <option>Loading plans...</option>
                ) : plans.length === 0 ? (
                  <option>No plans available</option>
                ) : (
                  plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} — ${(p.monthlyPriceCents / 100).toFixed(0)}/mo
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Org type
              </label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value as any)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="customer">Customer (paying)</option>
                <option value="trial">Trial</option>
                <option value="demo">Demo</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {orgType === "trial" && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Trial ends at *
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
          <h2 className="mb-1 text-sm font-semibold text-content">Owner</h2>
          <p className="mb-4 text-xs text-content-faint">
            If no User exists with this email, one will be created without a
            password. Sign in via impersonation, or the customer can set a
            password via the reset flow.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Email *
              </label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                placeholder="founder@acme.com"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Name
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Jane Doe"
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
                Provision environment &amp; business profile now
              </span>
              <span className="mt-0.5 block text-xs text-content-faint">
                Off by default. Owner fills the domain + monthly revenue + AOV + business model during onboarding after impersonation — they have the real numbers that calibrate impact findings. Flip this on only when you already have trustworthy data (e.g. from a sales call) and want a one-shot setup.
              </span>
            </span>
          </label>
        </section>

        {/* ── Environment ── */}
        {provisionEnv && (
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">Initial environment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Domain *
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                placeholder="acme.com"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              <p className="mt-1 text-xs text-content-faint">
                No protocol. We&#39;ll normalize and strip trailing slashes.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Landing URL
              </label>
              <input
                type="text"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder="https://acme.com/checkout"
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              <p className="mt-1 text-xs text-content-faint">
                Defaults to <span className="font-mono">https://{domain || "<domain>"}</span>
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
                Production environment
              </label>
            </div>
          </div>
        </section>
        )}

        {/* ── Business Profile ── */}
        {provisionEnv && (
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">Business profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Business model
              </label>
              <select
                value={businessModel}
                onChange={(e) => setBusinessModel(e.target.value as any)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="ecommerce">E-commerce</option>
                <option value="lead_gen">Lead gen</option>
                <option value="saas">SaaS</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Conversion model
              </label>
              <select
                value={conversionModel}
                onChange={(e) => setConversionModel(e.target.value as any)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="checkout">Checkout</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="form">Form</option>
                <option value="external">External</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Monthly revenue (USD)
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
                Average order value (USD)
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
