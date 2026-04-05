"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
  type PriceTier,
} from "@/components/ui/pricing-card";
import { PaddleLoader } from "@/paddle/paddleLoader";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface BillingData {
  plan: string;
  status: string;
  subscriptionId: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  usage: {
    environments: number;
    maxEnvironments: number;
    members: number;
    maxMembers: number;
    mcpQueries: number;
    maxMcpQueries: number;
  };
}

interface PricingPlan {
  key: string;
  label: string;
  paddlePriceId: string;
  monthlyPriceCents: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
}

declare global {
  interface Window {
    Paddle: any;
  }
}

// ──────────────────────────────────────────────
// Billing — subscription management + plan comparison
// Shows current plan info, usage, and upgrade/downgrade options.
// Plans are loaded from the admin-configured PlatformConfig via /api/pricing.
// ──────────────────────────────────────────────

export default function BillingPage() {
  const { data: session } = useSession();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const { plans: fetchedPlans, loading } = usePricingPlans();

  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Fetch billing data
  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      // Silently fail — page still works with fallback
    } finally {
      setBillingLoading(false);
    }
  }, []);

  // Fetch pricing plans (with paddlePriceId)
  useEffect(() => {
    async function loadPricing() {
      try {
        const res = await fetch("/api/pricing");
        if (res.ok) {
          const data = await res.json();
          if (data.plans) setPricingPlans(data.plans);
        }
      } catch {
        // Keep empty — pricing card component has its own fallback
      }
    }
    fetchBilling();
    loadPricing();
  }, [fetchBilling]);

  const currentPlanId = billing?.plan || "vestigio";
  const basePlans = fetchedPlans || FALLBACK_PLANS;

  // Mark the current plan in the plans array
  const plansWithCurrent = basePlans.map((plan) => ({
    ...plan,
    isCurrent: plan.id === currentPlanId,
  })) as [PriceTier, PriceTier, PriceTier];

  const currentPlan = basePlans.find((p) => p.id === currentPlanId);

  // ──────────────────────────────────────────────
  // Paddle Checkout — for new subscriptions
  // ──────────────────────────────────────────────

  const openPaddleCheckout = useCallback(
    (paddlePriceId: string) => {
      if (!window.Paddle) {
        toast.error("Payment system is loading. Please try again in a moment.");
        return;
      }

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customData: {
          userId: (session?.user as any)?.id || "",
        },
        settings: {
          displayMode: "overlay",
        },
      });
    },
    [session],
  );

  // ──────────────────────────────────────────────
  // Change Plan — for existing subscriptions
  // ──────────────────────────────────────────────

  const handleChangePlan = useCallback(
    async (newPaddlePriceId: string) => {
      if (!billing?.subscriptionId) return;

      setActionLoading(true);
      try {
        const res = await fetch("/api/paddle/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionId: billing.subscriptionId,
            priceId: newPaddlePriceId,
          }),
        });

        if (res.ok) {
          toast.success("Plan changed successfully. Changes take effect immediately.");
          // Refresh session so next-auth picks up changes from the webhook
          await signIn("fetchSession", { redirect: false });
          await fetchBilling();
        } else {
          const data = await res.json();
          toast.error(data.message || "Failed to change plan.");
        }
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setActionLoading(false);
        setShowManageMenu(false);
      }
    },
    [billing, fetchBilling],
  );

  // ──────────────────────────────────────────────
  // Cancel Subscription
  // ──────────────────────────────────────────────

  const handleCancelSubscription = useCallback(async () => {
    if (!billing?.subscriptionId) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/paddle/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: billing.subscriptionId,
        }),
      });

      if (res.ok) {
        toast.success("Subscription canceled. You'll retain access until the end of your billing period.");
        await signIn("fetchSession", { redirect: false });
        await fetchBilling();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to cancel subscription.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActionLoading(false);
      setShowCancelConfirm(false);
      setShowManageMenu(false);
    }
  }, [billing, fetchBilling]);

  // ──────────────────────────────────────────────
  // Plan Selection — routes to checkout or change-plan
  // ──────────────────────────────────────────────

  const handlePlanSelect = useCallback(
    (planId: string, _billingCycle: BillingCycle) => {
      if (planId === currentPlanId) return;

      // Find the paddlePriceId for the selected plan
      const targetPlan = pricingPlans.find((p) => p.key === planId);
      if (!targetPlan?.paddlePriceId) {
        toast.error("This plan is not yet available for purchase. Please contact support.");
        return;
      }

      if (billing?.subscriptionId) {
        // Existing subscriber — change plan via API
        handleChangePlan(targetPlan.paddlePriceId);
      } else {
        // No subscription yet — open Paddle checkout
        openPaddleCheckout(targetPlan.paddlePriceId);
      }
    },
    [currentPlanId, pricingPlans, billing, handleChangePlan, openPaddleCheckout],
  );

  // ──────────────────────────────────────────────
  // Format helpers
  // ──────────────────────────────────────────────

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const planLabel = (key: string) => {
    const labels: Record<string, string> = {
      vestigio: "Vestigio",
      pro: "Vestigio Pro",
      max: "Vestigio Max",
    };
    return labels[key] || key;
  };

  return (
    <div className="p-6">
      {/* Load Paddle SDK so checkout can be opened */}
      <PaddleLoader />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content">Billing</h1>
        <p className="mt-1 text-sm text-content-muted">
          Manage your subscription, compare plans, and upgrade anytime.
        </p>
      </div>

      {/* Current Plan Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
            Current Plan
          </h2>
          <div className="space-y-3">
            {[
              {
                label: "Plan",
                value: billingLoading ? "Loading..." : planLabel(currentPlanId),
              },
              {
                label: "Price",
                value: billingLoading
                  ? "Loading..."
                  : currentPlan
                    ? `$${currentPlan.priceMonthly}/mo`
                    : "—",
              },
              {
                label: "Renewal Date",
                value: billingLoading
                  ? "Loading..."
                  : formatDate(billing?.currentPeriodEnd || null),
              },
              {
                label: "Account",
                value: session?.user?.email || "—",
              },
              {
                label: "Status",
                value: billingLoading
                  ? "Loading..."
                  : billing?.subscriptionId
                    ? "Active"
                    : "No active subscription",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-content-muted">{row.label}</span>
                <span className="text-sm text-content-secondary">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Manage Subscription Button */}
          <div className="relative mt-4">
            {billing?.subscriptionId ? (
              <>
                <button
                  onClick={() => setShowManageMenu(!showManageMenu)}
                  disabled={actionLoading}
                  className="w-full rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Manage Subscription"}
                </button>

                {/* Dropdown Menu */}
                {showManageMenu && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-edge bg-surface-card shadow-lg">
                    <button
                      onClick={() => {
                        setShowManageMenu(false);
                        // Scroll to plan comparison section
                        document
                          .getElementById("plan-comparison")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
                    >
                      Change Plan
                    </button>
                    <button
                      onClick={() => {
                        setShowManageMenu(false);
                        setShowCancelConfirm(true);
                      }}
                      className="w-full border-t border-edge px-4 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-surface-card-hover"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => {
                  // No subscription — scroll to plans to pick one
                  document
                    .getElementById("plan-comparison")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                Subscribe to a Plan
              </button>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
            Usage This Period
          </h2>
          <div className="space-y-3">
            {[
              {
                label: "Agentic Insights",
                used: billingLoading ? "..." : String(billing?.usage.mcpQueries ?? 0),
                total: billingLoading ? "..." : String(billing?.usage.maxMcpQueries ?? "—"),
              },
              {
                label: "Environments",
                used: billingLoading ? "..." : String(billing?.usage.environments ?? 0),
                total: billingLoading ? "..." : String(billing?.usage.maxEnvironments ?? "—"),
              },
              {
                label: "Team Members",
                used: billingLoading ? "..." : String(billing?.usage.members ?? 0),
                total: billingLoading ? "..." : String(billing?.usage.maxMembers ?? "—"),
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-content-muted">{row.label}</span>
                <span className="text-sm text-content-secondary">
                  {row.used}{" "}
                  <span className="text-content-faint">/ {row.total}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border border-edge bg-surface-card p-6">
            <h3 className="text-lg font-semibold text-content">
              Cancel Subscription
            </h3>
            <p className="mt-2 text-sm text-content-muted">
              Are you sure you want to cancel your subscription? This action
              takes effect immediately. You will lose access to{" "}
              {planLabel(currentPlanId)} features.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={actionLoading}
                className="rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? "Canceling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Comparison */}
      {!loading && (
        <div
          id="plan-comparison"
          className="mt-8 rounded-xl border border-edge bg-surface-card"
        >
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

      {/* Close dropdown when clicking outside */}
      {showManageMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowManageMenu(false)}
        />
      )}
    </div>
  );
}
