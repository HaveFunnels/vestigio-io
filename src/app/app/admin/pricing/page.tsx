"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Admin Pricing Config
// Matches Overview visual identity.
// ──────────────────────────────────────────────

interface PlanFeature {
  name: string;
  included: boolean;
}

interface PlanConfig {
  key: string;
  label: string;
  priceId: string;
  paddleProductId: string;
  paddlePriceId: string;
  paddleAnnualPriceId: string;
  lemonSqueezyPriceId: string;
  // Mercado Pago PreApproval Plan ids — populated by the MP sync
  // button below. MP has no dashboard UI for creating plans, so this
  // is the only path. Empty until first sync.
  mpPreapprovalPlanId?: string;
  mpAnnualPreapprovalPlanId?: string;
  monthlyPriceCents: number;
  monthlyPriceCentsBrl?: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
  features?: PlanFeature[];
}

interface CreditConfig {
  baseCostPerCall: number;
  markupMultiplier: number;
}

export default function AdminPricingPage() {
  const t = useTranslations("console.admin.pricing");
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  // Snapshot of plans as they were last loaded. Used at save time to
  // detect Stripe priceId changes and warn the admin that the new
  // priceId only applies to NEW checkouts — existing subscriptions
  // continue billing at the old price until migrated in Stripe.
  const [originalPriceIds, setOriginalPriceIds] = useState<Record<string, string>>({});
  const [credits, setCredits] = useState<CreditConfig>({ baseCostPerCall: 0.05, markupMultiplier: 2.0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paddleSyncing, setPaddleSyncing] = useState(false);
  const [paddleSyncStatus, setPaddleSyncStatus] = useState<string | null>(null);
  const [paddleSyncError, setPaddleSyncError] = useState<string | null>(null);
  const [mpSyncing, setMpSyncing] = useState(false);
  const [mpSyncStatus, setMpSyncStatus] = useState<string | null>(null);
  const [mpSyncError, setMpSyncError] = useState<string | null>(null);

  // Active payment provider — admin override for which gateway serves
  // the LP funnel + new signup checkouts. `null` override = use the
  // env-based default surfaced as `providerDefault`.
  const [providerOverride, setProviderOverride] = useState<"mercadopago" | "paddle" | null>(null);
  const [providerDefault, setProviderDefault] = useState<"mercadopago" | "paddle">("mercadopago");
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/payment-provider")
      .then((r) => r.json())
      .then((data) => {
        setProviderOverride(data.override ?? null);
        setProviderDefault(data.default ?? "mercadopago");
      })
      .catch(() => {});
  }, []);

  const saveProvider = async (next: "mercadopago" | "paddle") => {
    setProviderSaving(true);
    setProviderSaved(false);
    try {
      const res = await fetch("/api/admin/payment-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: next }),
      });
      if (res.ok) {
        setProviderOverride(next);
        setProviderSaved(true);
        setTimeout(() => setProviderSaved(false), 2000);
      }
    } finally {
      setProviderSaving(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then((data) => {
        const next = data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          paddleAnnualPriceId: p.paddleAnnualPriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        }));
        setPlans(next);
        setOriginalPriceIds(
          Object.fromEntries(next.map((p: any) => [p.key, p.priceId || ""])),
        );
        setCredits(data.credits);
      })
      .catch(() => setError(t("failed_load")))
      .finally(() => setLoading(false));
  }, []);

  const updatePlan = (index: number, field: keyof PlanConfig, value: any) => {
    setPlans((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    // Detect any Stripe priceId changes. The admin pricing save writes
    // PlatformConfig.plans only — it doesn't migrate existing Stripe
    // subscriptions to the new priceId, so live subscribers keep being
    // billed at the old price indefinitely. Force a confirm dialog so
    // the admin reaches for Stripe's customer.subscriptions.update flow
    // (or accepts that the change applies to NEW checkouts only).
    const changedPriceIds = plans
      .filter((p) => (p.priceId || "") !== (originalPriceIds[p.key] || ""))
      .map((p) => `${p.label} (${originalPriceIds[p.key] || "—"} → ${p.priceId || "—"})`);
    if (changedPriceIds.length > 0) {
      const ok = confirm(
        `You changed the Stripe priceId for:\n\n${changedPriceIds.join("\n")}\n\n` +
          `This save updates PlatformConfig only — it does NOT migrate ` +
          `existing Stripe subscriptions to the new price. Current ` +
          `subscribers will keep being billed at the OLD price until you ` +
          `update them in the Stripe dashboard (or via the customer ` +
          `portal). The new priceId only applies to NEW checkouts.\n\n` +
          `Continue?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    setPaddleSyncError(null);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans, credits }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Save failed");
      }
      const data = await res.json();
      if (data.plans) {
        const next = data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          paddleAnnualPriceId: p.paddleAnnualPriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        }));
        setPlans(next);
        setOriginalPriceIds(
          Object.fromEntries(next.map((p: any) => [p.key, p.priceId || ""])),
        );
      }
      if (data.paddleSyncError) {
        setPaddleSyncError(data.paddleSyncError);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePaddleSync = async () => {
    setPaddleSyncing(true);
    setPaddleSyncError(null);
    setPaddleSyncStatus(null);
    try {
      const res = await fetch("/api/admin/pricing/paddle-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Paddle sync failed");
      if (data.plans) {
        setPlans(data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          paddleAnnualPriceId: p.paddleAnnualPriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        })));
      }
      setPaddleSyncStatus(data.message);
      if (data.errors) setPaddleSyncError(data.errors.join("; "));
      setTimeout(() => setPaddleSyncStatus(null), 5000);
    } catch (err: any) {
      setPaddleSyncError(err.message);
    } finally {
      setPaddleSyncing(false);
    }
  };

  const handleMpSync = async (force = false) => {
    setMpSyncing(true);
    setMpSyncError(null);
    setMpSyncStatus(null);
    try {
      const res = await fetch("/api/admin/pricing/mp-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (res.status !== 200 && res.status !== 207) {
        throw new Error(data.message || "MP sync failed");
      }
      if (data.plans) {
        setPlans((prev) =>
          prev.map((p) => {
            const updated = data.plans.find((d: any) => d.key === p.key);
            if (!updated) return p;
            return {
              ...p,
              mpPreapprovalPlanId: updated.mpPreapprovalPlanId || p.mpPreapprovalPlanId,
              mpAnnualPreapprovalPlanId:
                updated.mpAnnualPreapprovalPlanId || p.mpAnnualPreapprovalPlanId,
              monthlyPriceCentsBrl: updated.monthlyPriceCentsBrl ?? p.monthlyPriceCentsBrl,
            };
          }),
        );
      }
      setMpSyncStatus(
        `${data.message} — created=${data.created} skipped=${data.skipped}`,
      );
      if (data.errors?.length) setMpSyncError(data.errors.join("; "));
      setTimeout(() => setMpSyncStatus(null), 5000);
    } catch (err: any) {
      setMpSyncError(err.message);
    } finally {
      setMpSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-emerald-500" />
      </div>
    );
  }

  const inputClass = "w-full rounded-lg border border-edge bg-transparent px-3 py-1.5 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("subtitle")}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-5 py-3">
          <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Active payment provider */}
      <div className="rounded-lg border border-edge bg-surface-card p-5">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-content">Active payment provider</h2>
          {providerSaved && (
            <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Saved
            </span>
          )}
        </div>
        <p className="text-xs text-content-faint">
          Which gateway runs the LP funnel + new signup checkouts. Default is{" "}
          <span className="font-mono text-content-muted">{providerDefault}</span>{" "}
          (resolved from env vars). Setting an override here flips the active
          gateway without redeploying.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {([
            {
              key: "mercadopago" as const,
              label: "Mercado Pago",
              desc: "Pix + cartão. BRL only.",
            },
            {
              key: "paddle" as const,
              label: "Paddle",
              desc: "USD/global card checkout.",
            },
          ]).map((opt) => {
            const isActive = (providerOverride ?? providerDefault) === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => saveProvider(opt.key)}
                disabled={providerSaving}
                className={`flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  isActive
                    ? "border-emerald-500/50 bg-emerald-500/[0.06]"
                    : "border-edge bg-surface-card hover:border-edge-focus"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-content">
                    {opt.label}
                  </span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <span className="h-1 w-1 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  )}
                  {providerOverride === null && opt.key === providerDefault && (
                    <span className="text-[10px] text-content-faint">default</span>
                  )}
                </div>
                <span className="text-xs text-content-muted">{opt.desc}</span>
              </button>
            );
          })}
        </div>

        {providerOverride !== null && (
          <button
            type="button"
            onClick={async () => {
              // Clearing the override = revert to env-based default.
              setProviderSaving(true);
              try {
                const res = await fetch("/api/admin/payment-provider", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ provider: providerDefault }),
                });
                if (res.ok) {
                  setProviderOverride(null);
                  setProviderSaved(true);
                  setTimeout(() => setProviderSaved(false), 2000);
                }
              } finally {
                setProviderSaving(false);
              }
            }}
            disabled={providerSaving}
            className="mt-3 text-xs text-content-faint underline-offset-2 hover:text-content-muted hover:underline disabled:opacity-60"
          >
            Reset to env default
          </button>
        )}
      </div>

      {/* Plan configs */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">{t("plans")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_plan")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_price")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_mcp_calls")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_envs")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_members")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_continuous")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_credits")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {plans.map((plan, i) => (
                <tr key={plan.key} className="hover:bg-surface-card-hover">
                  <td className="px-5 py-3 font-medium text-content">{plan.label}</td>
                  <td className="px-5 py-3">
                    <input
                      type="number"
                      value={plan.monthlyPriceCents / 100}
                      onChange={(e) => updatePlan(i, "monthlyPriceCents", Math.round(parseFloat(e.target.value) * 100))}
                      className={`${inputClass} w-20`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <input type="number" value={plan.maxMcpCalls}
                      onChange={(e) => updatePlan(i, "maxMcpCalls", parseInt(e.target.value))}
                      className={`${inputClass} w-20`} />
                  </td>
                  <td className="px-5 py-3">
                    <input type="number" value={plan.maxEnvironments}
                      onChange={(e) => updatePlan(i, "maxEnvironments", parseInt(e.target.value))}
                      className={`${inputClass} w-16`} />
                  </td>
                  <td className="px-5 py-3">
                    <input type="number" value={plan.maxMembers}
                      onChange={(e) => updatePlan(i, "maxMembers", parseInt(e.target.value))}
                      className={`${inputClass} w-16`} />
                  </td>
                  <td className="px-5 py-3">
                    <input type="checkbox" checked={plan.continuousAudits}
                      onChange={(e) => updatePlan(i, "continuousAudits", e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500/30" />
                  </td>
                  <td className="px-5 py-3">
                    <input type="checkbox" checked={plan.creditsEnabled}
                      onChange={(e) => updatePlan(i, "creditsEnabled", e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500/30" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Table per Plan */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">{t("features_per_plan")}</h2>
          <p className="mt-1 text-xs text-content-faint">{t("features_subtitle")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_feature")}</th>
                {plans.map((plan) => (
                  <th key={plan.key} className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-content-muted">{plan.label}</th>
                ))}
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {(plans[0]?.features || []).map((_, featureIndex) => (
                <tr key={featureIndex} className="hover:bg-surface-card-hover">
                  <td className="px-5 py-2">
                    <input
                      type="text"
                      value={plans[0]?.features?.[featureIndex]?.name || ""}
                      onChange={(e) => {
                        const name = e.target.value;
                        setPlans((prev) => prev.map((p) => ({
                          ...p,
                          features: (p.features || []).map((f, fi) => fi === featureIndex ? { ...f, name } : f),
                        })));
                        setSaved(false);
                      }}
                      className={`${inputClass} w-full`}
                      placeholder={t("feature_name_placeholder")}
                    />
                  </td>
                  {plans.map((plan, planIndex) => (
                    <td key={plan.key} className="px-5 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={plan.features?.[featureIndex]?.included ?? false}
                        onChange={(e) => {
                          updatePlan(planIndex, "features" as any, (plan.features || []).map((f, fi) =>
                            fi === featureIndex ? { ...f, included: e.target.checked } : f
                          ));
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500/30"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPlans((prev) => prev.map((p) => ({
                          ...p,
                          features: (p.features || []).filter((_, fi) => fi !== featureIndex),
                        })));
                        setSaved(false);
                      }}
                      className="text-xs text-content-faint hover:text-red-400"
                      title="Remove feature"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setPlans((prev) => prev.map((p) => ({
                ...p,
                features: [...(p.features || []), { name: "", included: p.key !== "vestigio" }],
              })));
              setSaved(false);
            }}
            className="text-xs font-medium text-accent hover:text-accent/80"
          >
            {t("add_feature")}
          </button>
        </div>
      </div>

      {/* Payment Provider IDs */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">{t("payment_providers")}</h2>
          <p className="mt-1 text-xs text-content-faint">{t("payment_providers_subtitle")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_plan")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_stripe_price_id")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_paddle_product")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_paddle_monthly")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_paddle_annual")}</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">{t("col_lemon_squeezy")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {plans.map((plan, i) => (
                <tr key={plan.key} className="hover:bg-surface-card-hover">
                  <td className="px-5 py-3 font-medium text-content">{plan.label}</td>
                  <td className="px-5 py-3">
                    <input type="text" value={plan.priceId} placeholder="price_..."
                      onChange={(e) => updatePlan(i, "priceId", e.target.value)}
                      className={`${inputClass} w-56 font-mono text-xs`} />
                  </td>
                  <td className="px-5 py-3">
                    {plan.paddleProductId ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddleProductId}
                      </span>
                    ) : (
                      <span className="text-xs italic text-content-faint">{t("not_synced")}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {plan.paddlePriceId ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddlePriceId}
                      </span>
                    ) : (
                      <span className="text-xs italic text-content-faint">{t("not_synced")}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {plan.paddleAnnualPriceId ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddleAnnualPriceId}
                      </span>
                    ) : (
                      <span className="text-xs italic text-content-faint">{t("not_synced")}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <input type="text" value={plan.lemonSqueezyPriceId} placeholder="375601"
                      onChange={(e) => updatePlan(i, "lemonSqueezyPriceId", e.target.value)}
                      className={`${inputClass} w-36 font-mono text-xs`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paddle Sync */}
      <div className="rounded-lg border border-edge bg-surface-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-content">{t("paddle_sync")}</h2>
          <p className="mt-1 text-xs text-content-faint">
            {t("paddle_sync_subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handlePaddleSync}
            disabled={paddleSyncing}
            className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-50"
          >
            {paddleSyncing ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/10 border-t-emerald-500" />
                {t("syncing")}
              </span>
            ) : (
              t("sync_to_paddle")
            )}
          </button>

          {paddleSyncStatus && (
            <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {paddleSyncStatus}
            </span>
          )}

          {!paddleSyncStatus && plans.length > 0 && (
            plans.every((p) => p.paddleProductId && p.paddlePriceId) ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t("all_synced")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t("plans_not_synced", { count: plans.filter((p) => !p.paddleProductId || !p.paddlePriceId).length })}
              </span>
            )
          )}
        </div>

        {paddleSyncError && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400">
            {paddleSyncError}
          </div>
        )}
      </div>

      {/* Mercado Pago Sync */}
      <div className="rounded-lg border border-edge bg-surface-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-content">Mercado Pago sync</h2>
          <p className="mt-1 text-xs text-content-faint">
            MP has no dashboard UI for PreApproval Plans — they must be created via API.
            This button provisions Starter/Pro/Max × Monthly/Annual (6 plans total).
            Idempotent: skips plans that already have an id. Use "Force" to recreate.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleMpSync(false)}
            disabled={mpSyncing}
            className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-50"
          >
            {mpSyncing ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/10 border-t-emerald-500" />
                Syncing…
              </span>
            ) : (
              "Sync to Mercado Pago"
            )}
          </button>
          <button
            onClick={() => {
              if (confirm("Force recreates ALL MP plans — old ids become orphaned in MP dashboard. Continue?")) {
                handleMpSync(true);
              }
            }}
            disabled={mpSyncing}
            className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-500/5 disabled:opacity-50"
          >
            Force resync
          </button>

          {mpSyncStatus && (
            <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {mpSyncStatus}
            </span>
          )}

          {!mpSyncStatus && plans.length > 0 && (
            plans.filter((p) => p.key !== "free").every((p) => p.mpPreapprovalPlanId && p.mpAnnualPreapprovalPlanId) ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All MP plans synced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {plans.filter((p) => p.key !== "free").filter((p) => !p.mpPreapprovalPlanId || !p.mpAnnualPreapprovalPlanId).length} plan(s) need sync
              </span>
            )
          )}
        </div>

        {/* Show current MP ids for visibility */}
        <div className="mt-4 space-y-1 text-xs font-mono text-content-faint">
          {plans.filter((p) => p.key !== "free").map((p) => (
            <div key={p.key} className="flex flex-wrap gap-x-4">
              <span className="font-semibold text-content-secondary">{p.label}</span>
              <span>
                mensal: {p.mpPreapprovalPlanId || <em className="text-amber-400">missing</em>}
              </span>
              <span>
                anual: {p.mpAnnualPreapprovalPlanId || <em className="text-amber-400">missing</em>}
              </span>
            </div>
          ))}
        </div>

        {mpSyncError && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400">
            {mpSyncError}
          </div>
        )}
      </div>

      {/* Credit pricing */}
      <div className="rounded-lg border border-edge bg-surface-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-content">{t("credit_pricing")}</h2>
        </div>
        <div className="flex items-end gap-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-muted">{t("base_cost")}</label>
            <input type="number" step="0.01" value={credits.baseCostPerCall}
              onChange={(e) => { setCredits({ ...credits, baseCostPerCall: parseFloat(e.target.value) }); setSaved(false); }}
              className={`${inputClass} w-28`} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-muted">{t("markup")}</label>
            <input type="number" step="0.1" value={credits.markupMultiplier}
              onChange={(e) => { setCredits({ ...credits, markupMultiplier: parseFloat(e.target.value) }); setSaved(false); }}
              className={`${inputClass} w-28`} />
          </div>
          <div className="pb-1.5">
            <span className="text-sm text-content-faint">
              {t("effective_per_call")} <span className="font-semibold text-content">${(credits.baseCostPerCall * credits.markupMultiplier).toFixed(2)}</span> / call
            </span>
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          saved
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-accent-text text-white hover:bg-accent-text/90"
        }`}
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_config")}
      </button>
    </div>
  );
}
