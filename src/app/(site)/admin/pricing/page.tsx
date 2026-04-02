"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin Pricing Config
// Persists to PlatformConfig via /api/admin/pricing
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
      // Update plans with any new Paddle IDs from sync
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
      const res = await fetch("/api/admin/pricing/paddle-sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Paddle sync failed");
      }
      // Update plans with synced Paddle IDs
      if (data.plans) {
        setPlans(data.plans.map((p: any) => ({
          ...p,
          paddleProductId: p.paddleProductId || "",
          paddlePriceId: p.paddlePriceId || "",
          lemonSqueezyPriceId: p.lemonSqueezyPriceId || "",
        })));
      }
      setPaddleSyncStatus(data.message);
      if (data.errors) {
        setPaddleSyncError(data.errors.join("; "));
      }
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-dark dark:text-white">Pricing Configuration</h1>
        <p className="mt-1 text-sm text-body-color">
          Configure plan limits, price IDs for each payment provider, MCP quotas, and credit pricing.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Plan configs */}
      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-body-color">Plans</h2>
        <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Price ($/mo)</th>
                <th className="px-4 py-3 font-medium">MCP Calls</th>
                <th className="px-4 py-3 font-medium">Envs</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Continuous</th>
                <th className="px-4 py-3 font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => (
                <tr key={plan.key} className="border-b border-stroke dark:border-stroke-dark">
                  <td className="px-4 py-3 font-medium">{plan.label}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={plan.monthlyPriceCents / 100}
                      onChange={(e) => updatePlan(i, "monthlyPriceCents", Math.round(parseFloat(e.target.value) * 100))}
                      className="w-20 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" value={plan.maxMcpCalls}
                      onChange={(e) => updatePlan(i, "maxMcpCalls", parseInt(e.target.value))}
                      className="w-20 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" value={plan.maxEnvironments}
                      onChange={(e) => updatePlan(i, "maxEnvironments", parseInt(e.target.value))}
                      className="w-16 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" value={plan.maxMembers}
                      onChange={(e) => updatePlan(i, "maxMembers", parseInt(e.target.value))}
                      className="w-16 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={plan.continuousAudits}
                      onChange={(e) => updatePlan(i, "continuousAudits", e.target.checked)} />
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={plan.creditsEnabled}
                      onChange={(e) => updatePlan(i, "creditsEnabled", e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price IDs per provider */}
      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-body-color">Payment Provider Price IDs</h2>
        <p className="text-xs text-body-color">Configure the price IDs from each payment provider dashboard. Paddle IDs marked &quot;auto&quot; are managed via Sync.</p>
        <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Stripe Price ID</th>
                <th className="px-4 py-3 font-medium">Paddle Product ID</th>
                <th className="px-4 py-3 font-medium">Paddle Price ID</th>
                <th className="px-4 py-3 font-medium">Lemon Squeezy ID</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => (
                <tr key={plan.key} className="border-b border-stroke dark:border-stroke-dark">
                  <td className="px-4 py-3 font-medium">{plan.label}</td>
                  <td className="px-4 py-3">
                    <input type="text" value={plan.priceId} placeholder="price_..."
                      onChange={(e) => updatePlan(i, "priceId", e.target.value)}
                      className="w-64 rounded border border-stroke bg-transparent px-2 py-1 text-xs font-mono dark:border-stroke-dark" />
                  </td>
                  <td className="px-4 py-3">
                    {plan.paddleProductId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddleProductId}
                      </span>
                    ) : (
                      <span className="text-xs text-body-color/50 italic">Not synced</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {plan.paddlePriceId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {plan.paddlePriceId}
                      </span>
                    ) : (
                      <span className="text-xs text-body-color/50 italic">Not synced</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <input type="text" value={plan.lemonSqueezyPriceId} placeholder="375601"
                      onChange={(e) => updatePlan(i, "lemonSqueezyPriceId", e.target.value)}
                      className="w-40 rounded border border-stroke bg-transparent px-2 py-1 text-xs font-mono dark:border-stroke-dark" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paddle Sync */}
      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-body-color">Paddle Sync</h2>
        <p className="text-xs text-body-color">
          Automatically create products and prices in Paddle for plans that are missing IDs.
          Paddle IDs are auto-generated when you save, or you can trigger a manual sync.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handlePaddleSync}
            disabled={paddleSyncing}
            className="rounded-md border border-stroke bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-1 disabled:opacity-50 dark:border-stroke-dark dark:hover:bg-gray-dark"
          >
            {paddleSyncing ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
                Syncing...
              </span>
            ) : (
              "Sync to Paddle"
            )}
          </button>

          {/* Sync status indicator */}
          {paddleSyncStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {paddleSyncStatus}
            </span>
          )}

          {/* Overall sync status based on plan data */}
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
          <div className="rounded-md border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            Paddle sync error: {paddleSyncError}
          </div>
        )}
      </div>

      {/* Credit pricing */}
      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-body-color">Credit Pricing</h2>
        <div className="flex gap-4">
          <div>
            <label className="mb-1 block text-xs text-body-color">Base cost per MCP call ($)</label>
            <input type="number" step="0.01" value={credits.baseCostPerCall}
              onChange={(e) => { setCredits({ ...credits, baseCostPerCall: parseFloat(e.target.value) }); setSaved(false); }}
              className="w-24 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-body-color">Markup multiplier</label>
            <input type="number" step="0.1" value={credits.markupMultiplier}
              onChange={(e) => { setCredits({ ...credits, markupMultiplier: parseFloat(e.target.value) }); setSaved(false); }}
              className="w-24 rounded border border-stroke bg-transparent px-2 py-1 text-sm dark:border-stroke-dark" />
          </div>
          <div className="flex items-end">
            <span className="text-xs text-body-color">
              Effective: ${(credits.baseCostPerCall * credits.markupMultiplier).toFixed(2)} / call
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
      </button>
    </div>
  );
}
