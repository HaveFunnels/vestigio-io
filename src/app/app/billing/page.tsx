"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
  type PriceTier,
} from "@/components/ui/pricing-card";

// ──────────────────────────────────────────────
// Billing — subscription management + plan comparison
// Shows current plan info, usage, and upgrade/downgrade options.
// Plans are loaded from the admin-configured PlatformConfig via /api/pricing.
// ──────────────────────────────────────────────

export default function BillingPage() {
  const { data: session } = useSession();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const { plans: fetchedPlans, loading } = usePricingPlans();

  // TODO: read actual plan from org context when billing is wired up
  const currentPlanId = "pro";

  const basePlans = fetchedPlans || FALLBACK_PLANS;

  // Mark the current plan in the plans array
  const plansWithCurrent = basePlans.map((plan) => ({
    ...plan,
    isCurrent: plan.id === currentPlanId,
  })) as [PriceTier, PriceTier, PriceTier];

  const currentPlan = basePlans.find((p) => p.id === currentPlanId);

  const handlePlanSelect = (planId: string, billingCycle: BillingCycle) => {
    if (planId === currentPlanId) return;
    // TODO: integrate with Stripe/Paddle checkout
    console.log(`Upgrade/downgrade to ${planId} (${billingCycle})`);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Billing</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your subscription, compare plans, and upgrade anytime.
        </p>
      </div>

      {/* Current Plan Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Current Plan
          </h2>
          <div className="space-y-3">
            {[
              { label: "Plan", value: currentPlan?.name || "—" },
              {
                label: "Price",
                value: currentPlan
                  ? `$${currentPlan.priceMonthly}/mo`
                  : "—",
              },
              { label: "Billing", value: "Monthly" },
              {
                label: "Account",
                value: session?.user?.email || "—",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-zinc-500">{row.label}</span>
                <span className="text-sm text-zinc-200">{row.value}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
            Manage Subscription
          </button>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Usage This Period
          </h2>
          <div className="space-y-3">
            {[
              { label: "Agentic Insights", used: "—", total: "—" },
              { label: "Environments", used: "1", total: "—" },
              { label: "Team Members", used: "1", total: "—" },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-zinc-500">{row.label}</span>
                <span className="text-sm text-zinc-200">
                  {row.used}{" "}
                  <span className="text-zinc-600">/ {row.total}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Plan Comparison */}
      {!loading && (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/30">
          <PricingComponent
            plans={plansWithCurrent}
            billingCycle={cycle}
            onCycleChange={setCycle}
            onPlanSelect={handlePlanSelect}
            heading="Compare Plans"
            subheading="Upgrade or downgrade anytime. Changes take effect immediately."
          />
        </div>
      )}
    </div>
  );
}
