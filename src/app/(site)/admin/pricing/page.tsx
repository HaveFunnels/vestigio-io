"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin Pricing Config
// Matches Overview visual identity.
// ──────────────────────────────────────────────

interface PlanConfig {
  key: string;
  label: string;
  priceId: string;
  paddleProductId: string;
  paddlePriceId: string;
  lemonSqueezyPriceId: string;
  monthlyPriceCents: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
}

interface CreditConfig {
  baseCostPerCall: number;
  markupMultiplier: number;
}

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [credits, setCredits] = useState<CreditConfig>({ baseCostPerCall: 0.05, markupMultiplier: 2.0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paddleSyncing, setPaddleSyncing] = useState(false);
  const [paddleSyncStatus, setPaddleSyncStatus] = useState<string | null>(null);
  const [paddleSyncError, setPaddleSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then((data) => {
        setPlans(data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        })));
        setCredits(data.credits);
      })
      .catch(() => setError("Failed to load pricing config"))
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
        setPlans(data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        })));
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
        <h1 className="text-xl font-semibold text-content">Pricing Configuration</h1>
        <p className="mt-1 text-sm text-content-muted">
          Configure plan limits, price IDs, MCP quotas, and credit pricing.
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

      {/* Plan configs */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">Plans</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Plan</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Price ($/mo)</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">MCP Calls</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Envs</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Members</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Continuous</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Credits</th>
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

      {/* Payment Provider IDs */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">Payment Provider Price IDs</h2>
          <p className="mt-1 text-xs text-content-faint">Paddle IDs are auto-managed via Sync.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Plan</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Stripe Price ID</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Paddle Product</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Paddle Price</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Lemon Squeezy</th>
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
                      <span className="text-xs italic text-content-faint">Not synced</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {plan.paddlePriceId ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddlePriceId}
                      </span>
                    ) : (
                      <span className="text-xs italic text-content-faint">Not synced</span>
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
          <h2 className="text-sm font-semibold text-content">Paddle Sync</h2>
          <p className="mt-1 text-xs text-content-faint">
            Create products and prices in Paddle for plans missing IDs.
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
                Syncing...
              </span>
            ) : (
              "Sync to Paddle"
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
                All plans synced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {plans.filter((p) => !p.paddleProductId || !p.paddlePriceId).length} plan(s) not synced
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

      {/* Credit pricing */}
      <div className="rounded-lg border border-edge bg-surface-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-content">Credit Pricing</h2>
        </div>
        <div className="flex items-end gap-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-muted">Base cost per MCP call ($)</label>
            <input type="number" step="0.01" value={credits.baseCostPerCall}
              onChange={(e) => { setCredits({ ...credits, baseCostPerCall: parseFloat(e.target.value) }); setSaved(false); }}
              className={`${inputClass} w-28`} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-content-muted">Markup multiplier</label>
            <input type="number" step="0.1" value={credits.markupMultiplier}
              onChange={(e) => { setCredits({ ...credits, markupMultiplier: parseFloat(e.target.value) }); setSaved(false); }}
              className={`${inputClass} w-28`} />
          </div>
          <div className="pb-1.5">
            <span className="text-sm text-content-faint">
              Effective: <span className="font-semibold text-content">${(credits.baseCostPerCall * credits.markupMultiplier).toFixed(2)}</span> / call
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
        {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
      </button>
    </div>
  );
}
