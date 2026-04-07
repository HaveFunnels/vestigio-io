"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

declare global {
  interface Window {
    Paddle: any;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type BusinessType = "ecommerce" | "lead_gen" | "saas" | "hybrid";
type ConversionModel = "checkout" | "whatsapp" | "form" | "external";

interface OnboardState {
  organizationName: string;
  domain: string;
  ownershipConfirmed: boolean;
  businessType: BusinessType;
  monthlyRevenue: string;
  averageTicket: string;
  conversionModel: ConversionModel;
  // SaaS optional fields
  saasLoginUrl: string;
  saasEmail: string;
  saasAuthMethod: string;
  saasMfaMode: string;
  saasSkipped: boolean;
  // Notifications
  phone: string; // E.164 e.g. +5511999999999
  notifyEmail: boolean;
  notifySms: boolean;
  notifyWhatsapp: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const businessOptions: { value: BusinessType; label: string; description: string }[] = [
  { value: "ecommerce", label: "Ecommerce", description: "Direct online sales" },
  { value: "lead_gen", label: "Lead Gen", description: "Lead capture and nurture" },
  { value: "saas", label: "SaaS", description: "Subscription software" },
  { value: "hybrid", label: "Hybrid", description: "Mixed business model" },
];

const conversionOptions: { value: ConversionModel; label: string }[] = [
  { value: "checkout", label: "Checkout (on-site purchase)" },
  { value: "whatsapp", label: "WhatsApp / Messaging" },
  { value: "form", label: "Form Submission" },
  { value: "external", label: "External Redirect" },
];

interface Plan {
  key: string;
  name: string;
  price: string;
  paddlePriceId: string;
  features: string[];
  recommended: boolean;
}

// Default plans (fallback while fetching from API)
const DEFAULT_PLANS: Plan[] = [
  {
    key: "vestigio",
    name: "Vestigio",
    price: "$99",
    paddlePriceId: "",
    features: ["1 domain", "Agentic insights", "Full analysis", "Impact quantification"],
    recommended: false,
  },
  {
    key: "pro",
    name: "Vestigio Pro",
    price: "$199",
    paddlePriceId: "",
    features: ["3 domains", "5x more agentic insights", "Continuous audits", "Root cause maps"],
    recommended: true,
  },
  {
    key: "max",
    name: "Vestigio Max",
    price: "$399",
    paddlePriceId: "",
    features: ["10 domains", "20x more agentic insights", "Continuous audits", "Credits system", "Priority support"],
    recommended: false,
  },
];

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------
const DOMAIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)(?:\/.*)?$/;

function isValidDomainFormat(input: string): boolean {
  return DOMAIN_REGEX.test(input.trim());
}

async function validateDomainReachability(domain: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  try {
    const res = await fetch(`/api/validate-domain?domain=${encodeURIComponent(normalized)}`);
    const data = await res.json();
    return data;
  } catch {
    // Network error — don't block onboarding, just warn
    return { ok: true };
  }
}

function parseRevenue(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  if (value.toLowerCase().includes("k")) return num * 1000;
  if (value.toLowerCase().includes("m")) return num * 1000000;
  return num;
}

// ---------------------------------------------------------------------------
// Step definitions: dynamic based on business type
// ---------------------------------------------------------------------------
type StepId = "org" | "domain" | "business" | "saas_setup" | "notifications" | "review" | "plan";

function getSteps(businessType: BusinessType): StepId[] {
  const base: StepId[] = ["org", "domain", "business"];
  if (businessType === "saas") {
    base.push("saas_setup");
  }
  base.push("notifications", "review", "plan");
  return base;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OnboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update: updateSession } = useSession();
  const paymentSuccess = searchParams.get("payment_success") === "true";

  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(DEFAULT_PLANS[0]);
  const [activating, setActivating] = useState(paymentSuccess);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainWarning, setDomainWarning] = useState<string | null>(null);

  // Fetch plans from API on mount
  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch("/api/pricing");
        if (!res.ok) return;
        const data = await res.json();
        if (data.plans && data.plans.length > 0) {
          const mapped: Plan[] = data.plans.map((p: any, idx: number) => ({
            key: p.key,
            name: p.label,
            price: `$${Math.round(p.monthlyPriceCents / 100)}`,
            paddlePriceId: p.paddlePriceId || "",
            features: [
              `${p.maxEnvironments} domain${p.maxEnvironments > 1 ? "s" : ""}`,
              idx === 0 ? "Agentic insights" : idx === 1 ? "5x more agentic insights" : "20x more agentic insights",
              ...(p.continuousAudits ? ["Continuous audits"] : ["Full analysis"]),
              ...(p.creditsEnabled ? ["Credits system"] : []),
              ...(p.key === "max" ? ["Priority support"] : []),
              ...(p.key === "vestigio" ? ["Impact quantification"] : []),
              ...(p.key === "pro" ? ["Root cause maps"] : []),
            ],
            recommended: p.key === "pro",
          }));
          setPlans(mapped);
          setSelectedPlan(mapped[0]);
        }
      } catch {
        // Keep default plans on error
      }
    }
    fetchPlans();
  }, []);

  // If user already has an active org WITH a domain and this is not a payment callback, redirect to app.
  // Users with an org but no domain (e.g. demo accounts) should be allowed to complete setup.
  const [hasExistingDomain, setHasExistingDomain] = useState<boolean | null>(null);
  useEffect(() => {
    if ((session?.user as any)?.hasOrganization === true) {
      fetch("/api/usage").then(r => r.ok ? r.json() : null).then(data => {
        setHasExistingDomain(!!data?.domain);
        if (!paymentSuccess && data?.domain) {
          router.replace("/app/analysis");
        }
      }).catch(() => {});
    }
  }, [session, paymentSuccess, router]);

  // After payment success, poll session until org is activated by webhook
  useEffect(() => {
    if (!paymentSuccess) return;
    setActivating(true);

    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max
    const interval = setInterval(async () => {
      attempts++;
      await updateSession(); // triggers JWT callback → re-checks membership from DB

      // Session will update reactively; check on next render cycle
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setActivating(false);
        setError("Activation is taking longer than expected. Please refresh the page.");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [paymentSuccess, updateSession]);

  // React to session change after polling
  useEffect(() => {
    if (paymentSuccess && (session?.user as any)?.hasOrganization === true) {
      setActivating(false);
      // Hand off to the thank-you bridge page, which will then redirect
      // to /app/inventory where the audit progress banner is visible.
      const orgId = searchParams.get("org") || "";
      router.replace(`/app/onboarding/thank-you${orgId ? `?org=${encodeURIComponent(orgId)}` : ""}`);
    }
  }, [session, paymentSuccess, router, searchParams]);
  const [form, setForm] = useState<OnboardState>({
    organizationName: "",
    domain: "",
    ownershipConfirmed: false,
    businessType: "ecommerce",
    monthlyRevenue: "",
    averageTicket: "",
    conversionModel: "checkout",
    saasLoginUrl: "",
    saasEmail: "",
    saasAuthMethod: "unknown",
    saasMfaMode: "unknown",
    saasSkipped: false,
    phone: "",
    notifyEmail: true,
    notifySms: false,
    notifyWhatsapp: false,
  });

  const [phoneError, setPhoneError] = useState<string | null>(null);

  function isValidPhone(p: string): boolean {
    if (!p) return true; // optional
    const cleaned = p.replace(/[\s\-()]/g, "");
    return /^\+?[1-9]\d{6,14}$/.test(cleaned);
  }

  const steps = useMemo(() => getSteps(form.businessType), [form.businessType]);
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] || "org";

  const next = async () => {
    // Validate domain before advancing from domain step
    if (currentStep === "domain") {
      setDomainError(null);
      setDomainWarning(null);

      if (!isValidDomainFormat(form.domain)) {
        setDomainError("Please enter a valid domain (e.g. example.com or https://example.com)");
        return;
      }

      setDomainChecking(true);
      const result = await validateDomainReachability(form.domain);
      setDomainChecking(false);

      if (!result.ok) {
        setDomainWarning(result.error || "Domain may not be reachable. You can continue, but the audit may fail.");
      }
    }

    // Validate phone format on notifications step (allow empty)
    if (currentStep === "notifications") {
      setPhoneError(null);
      if (form.phone && !isValidPhone(form.phone)) {
        setPhoneError("Please enter a valid phone in international format (e.g. +5511999999999)");
        return;
      }
      // Persist phone + prefs to user (best-effort, don't block)
      const cleanedPhone = form.phone ? form.phone.replace(/[\s\-()]/g, "") : "";
      try {
        await Promise.all([
          fetch("/api/user/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: cleanedPhone }),
          }),
          fetch("/api/user/notification-prefs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              emailEnabled: form.notifyEmail,
              smsEnabled: form.notifySms && !!cleanedPhone,
              whatsappEnabled: form.notifyWhatsapp && !!cleanedPhone,
            }),
          }),
        ]);
      } catch {
        // best-effort — user can configure later in Settings
      }
    }
    setStepIndex((s) => Math.min(s + 1, totalSteps - 1));
  };
  const prev = () => setStepIndex((s) => Math.max(s - 1, 0));

  const update = <K extends keyof OnboardState>(key: K, value: OnboardState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSkipSaas = () => {
    update("saasSkipped", true);
    next();
  };

  const handleActivate = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create org + env + profile via API (no Stripe session)
      const response = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: form.organizationName,
          domain: form.domain,
          businessModel: form.businessType,
          monthlyRevenue: parseRevenue(form.monthlyRevenue),
          averageOrderValue: parseRevenue(form.averageTicket),
          conversionModel: form.conversionModel,
          priceId: selectedPlan.paddlePriceId,
          paymentProvider: "paddle",
          // Pass SaaS fields if configured
          ...(form.businessType === "saas" && !form.saasSkipped && form.saasLoginUrl
            ? {
                saasLoginUrl: form.saasLoginUrl,
                saasEmail: form.saasEmail,
                saasAuthMethod: form.saasAuthMethod,
                saasMfaMode: form.saasMfaMode,
              }
            : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Something went wrong");
        setLoading(false);
        return;
      }

      const orgId = data.organizationId;

      // Step 2: Open Paddle checkout on client-side
      if (!window.Paddle) {
        setError("Payment system is loading. Please try again in a moment.");
        setLoading(false);
        return;
      }

      window.Paddle.Checkout.open({
        items: [
          {
            priceId: selectedPlan.paddlePriceId,
            quantity: 1,
          },
        ],
        customData: {
          userId: (session?.user as any)?.id || "",
          organizationId: orgId,
          onboarding: "true",
        },
        successUrl: `${window.location.origin}/app/onboarding?payment_success=true&org=${orgId}`,
        settings: {
          displayMode: "overlay",
        },
      });

      setLoading(false);
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const canAdvance =
    (currentStep === "org" && form.organizationName.length > 0) ||
    (currentStep === "domain" && form.domain.length > 0 && form.ownershipConfirmed) ||
    currentStep === "business" ||
    currentStep === "saas_setup" ||
    currentStep === "notifications" ||
    currentStep === "review";

  // Show activation loading screen while waiting for webhook
  if (activating) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-20">
        <div className="text-center space-y-4">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-100">Setting up your workspace...</h2>
          <p className="text-sm text-zinc-500">This usually takes a few seconds.</p>
          {error && (
            <div className="rounded-md border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-lg">
        {/* Step indicator */}
        <div className="mb-8 text-center">
          <span className="text-sm font-medium text-zinc-500">
            Step {stepIndex + 1}/{totalSteps}
          </span>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-emerald-500" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </div>

        {/* ── Step: Organization Name ── */}
        {currentStep === "org" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Name your organization</h1>
              <p className="mt-1 text-sm text-zinc-500">
                This is your team or company name in Vestigio.
              </p>
            </div>
            <div>
              <label htmlFor="orgName" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Organization name
              </label>
              <input
                id="orgName"
                type="text"
                value={form.organizationName}
                onChange={(e) => update("organizationName", e.target.value)}
                placeholder="Acme Corp"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </section>
        )}

        {/* ── Step: Domain ── */}
        {currentStep === "domain" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">What domain do you want to audit?</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Enter your website URL so Vestigio can start the analysis.
              </p>
            </div>
            <div>
              <label htmlFor="domain" className="mb-1.5 block text-sm font-medium text-zinc-300">Domain</label>
              <input
                id="domain"
                type="url"
                value={form.domain}
                onChange={(e) => { update("domain", e.target.value); setDomainError(null); setDomainWarning(null); }}
                placeholder="https://example.com"
                className={`w-full rounded-md border bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 ${
                  domainError ? "border-red-600 focus:border-red-600 focus:ring-red-600" : "border-zinc-700 focus:border-emerald-600 focus:ring-emerald-600"
                }`}
              />
              {domainError && (
                <p className="mt-1.5 text-xs text-red-400">{domainError}</p>
              )}
              {domainWarning && (
                <div className="mt-2 rounded-md border border-amber-800/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  {domainWarning} — you can still proceed.
                </div>
              )}
            </div>

            {/* Ownership confirmation — required before audit can run */}
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-600">
                <input
                  type="checkbox"
                  checked={form.ownershipConfirmed}
                  onChange={(e) => update("ownershipConfirmed", e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-emerald-500"
                />
                <div className="text-xs leading-relaxed text-zinc-400">
                  <span className="block font-medium text-zinc-200">
                    I own this domain or have authorization to audit it
                  </span>
                  <span className="mt-0.5 block text-zinc-500">
                    Vestigio will only crawl public pages. By checking this you confirm you have the right to analyze this site.
                  </span>
                </div>
              </label>
            </div>
          </section>
        )}

        {/* ── Step: Business Context ── */}
        {currentStep === "business" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Business context</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Help Vestigio tailor its analysis to your business model.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Business type</label>
              <div className="grid grid-cols-2 gap-2">
                {businessOptions.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => update("businessType", o.value)}
                    className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                      form.businessType === o.value
                        ? "border-emerald-600 bg-emerald-500/10 text-zinc-100"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <div className="font-medium">{o.label}</div>
                    <div className="text-xs text-zinc-500">{o.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="monthlyRevenue" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Monthly revenue <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="monthlyRevenue"
                type="text"
                value={form.monthlyRevenue}
                onChange={(e) => update("monthlyRevenue", e.target.value)}
                placeholder="e.g. $50k"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="averageTicket" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Average order value <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="averageTicket"
                type="text"
                value={form.averageTicket}
                onChange={(e) => update("averageTicket", e.target.value)}
                placeholder="e.g. $120"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Conversion model</label>
              <select
                value={form.conversionModel}
                onChange={(e) => update("conversionModel", e.target.value as ConversionModel)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              >
                {conversionOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* ── Step: SaaS Setup (OPTIONAL) ── */}
        {currentStep === "saas_setup" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Authenticated app access</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Since you're running a SaaS, Vestigio can analyze your app behind the login wall.
                This is <strong className="text-zinc-300">optional</strong> — you can configure it later in Settings.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">App login URL</label>
                <input
                  type="url"
                  value={form.saasLoginUrl}
                  onChange={(e) => update("saasLoginUrl", e.target.value)}
                  placeholder="https://app.example.com/login"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Test account email</label>
                <input
                  type="email"
                  value={form.saasEmail}
                  onChange={(e) => update("saasEmail", e.target.value)}
                  placeholder="test@example.com"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">Auth method</label>
                  <select
                    value={form.saasAuthMethod}
                    onChange={(e) => update("saasAuthMethod", e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  >
                    <option value="unknown">Not sure</option>
                    <option value="password">Email + Password</option>
                    <option value="oauth">OAuth / SSO</option>
                    <option value="magic_link">Magic Link</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">MFA / 2FA</label>
                  <select
                    value={form.saasMfaMode}
                    onChange={(e) => update("saasMfaMode", e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  >
                    <option value="unknown">Not sure</option>
                    <option value="none">No MFA</option>
                    <option value="optional">Optional</option>
                    <option value="required">Required</option>
                  </select>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              You can complete this later in Settings → Data Sources. Skipping will not affect your onboarding.
            </p>
          </section>
        )}

        {/* ── Step: Notifications (phone + channel prefs) ── */}
        {currentStep === "notifications" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Stay informed</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Get alerted when one of your pages goes down, when an incident is detected,
                or when a regression appears. You can change these anytime in Settings.
              </p>
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Phone number <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => { update("phone", e.target.value); setPhoneError(null); }}
                placeholder="+5511999999999"
                className={`w-full rounded-md border bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 ${
                  phoneError ? "border-red-600 focus:border-red-600 focus:ring-red-600" : "border-zinc-700 focus:border-emerald-600 focus:ring-emerald-600"
                }`}
              />
              {phoneError && (
                <p className="mt-1.5 text-xs text-red-400">{phoneError}</p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500">
                International format. Required only if you enable SMS or WhatsApp.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">Notify me by</label>
              <div className="space-y-2">
                {[
                  { key: "notifyEmail", label: "Email", desc: "Detailed alerts with context", needsPhone: false },
                  { key: "notifySms", label: "SMS", desc: "Short critical alerts only", needsPhone: true },
                  { key: "notifyWhatsapp", label: "WhatsApp", desc: "Conversational alerts", needsPhone: true },
                ].map((channel) => {
                  const enabled = form[channel.key as "notifyEmail"];
                  const disabled = channel.needsPhone && !form.phone;
                  return (
                    <button
                      key={channel.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => update(channel.key as "notifyEmail", !enabled)}
                      className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
                        enabled && !disabled
                          ? "border-emerald-600 bg-emerald-500/10"
                          : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{channel.label}</div>
                        <div className="text-xs text-zinc-500">{channel.desc}{disabled ? " — add a phone number first" : ""}</div>
                      </div>
                      <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${enabled && !disabled ? "bg-emerald-500" : "bg-zinc-700"}`}>
                        <div className={`h-4 w-4 rounded-full bg-white transition-transform ${enabled && !disabled ? "translate-x-4" : ""}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Step: Review ── */}
        {currentStep === "review" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Review your setup</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Confirm your details before choosing a plan.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { label: "Organization", value: form.organizationName || "—" },
                { label: "Domain", value: form.domain || "—" },
                { label: "Business Type", value: form.businessType },
                { label: "Monthly Revenue", value: form.monthlyRevenue || "Not provided" },
                { label: "Avg. Order Value", value: form.averageTicket || "Not provided" },
                { label: "Conversion Model", value: form.conversionModel },
                ...(form.businessType === "saas"
                  ? [{
                      label: "SaaS Access",
                      value: form.saasSkipped
                        ? "Skipped — configure later in Data Sources"
                        : form.saasLoginUrl
                          ? `${form.saasLoginUrl} (${form.saasEmail || "no email yet"})`
                          : "Not configured — configure later in Data Sources",
                    }]
                  : []),
                {
                  label: "Notifications",
                  value: [
                    form.notifyEmail && "Email",
                    form.notifySms && form.phone && "SMS",
                    form.notifyWhatsapp && form.phone && "WhatsApp",
                  ].filter(Boolean).join(", ") || "Email only",
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                  <span className="text-xs text-zinc-500">{item.label}</span>
                  <span className="text-sm text-zinc-200">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Step: Choose Plan + Checkout ── */}
        {currentStep === "plan" && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Choose your plan</h1>
              <p className="mt-1 text-sm text-zinc-500">
                A plan is required to activate Vestigio. You can upgrade anytime.
              </p>
            </div>

            <div className="space-y-3">
              {plans.map((plan) => (
                <button
                  key={plan.key}
                  onClick={() => setSelectedPlan(plan)}
                  className={`w-full rounded-lg border text-left transition-colors ${
                    selectedPlan.key === plan.key
                      ? "border-emerald-600 bg-emerald-500/5"
                      : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                  }`}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{plan.name}</span>
                        {plan.recommended && (
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-zinc-100">{plan.price}<span className="text-xs text-zinc-500">/mo</span></span>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-1 text-xs text-zinc-400">
                          <span className="text-emerald-500">+</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="rounded-md border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleActivate}
              disabled={loading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Opening checkout..." : `Activate ${selectedPlan.name} — ${selectedPlan.price}/mo`}
            </button>

            <p className="text-center text-xs text-zinc-600">
              Secure payment via Paddle.
            </p>
          </section>
        )}

        {/* ── Navigation ── */}
        {currentStep !== "plan" && (
          <div className="mt-8 flex justify-between">
            <button
              onClick={prev}
              disabled={stepIndex === 0}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <div className="flex gap-2">
              {currentStep === "saas_setup" && (
                <button
                  onClick={handleSkipSaas}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800"
                >
                  Skip for now
                </button>
              )}
              <button
                onClick={next}
                disabled={!canAdvance || domainChecking}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-30"
              >
                {domainChecking ? "Checking domain..." : "Next"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
