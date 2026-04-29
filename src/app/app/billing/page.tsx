"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
  type PriceTier,
} from "@/components/ui/pricing-card";
import { PaddleLoader } from "@/paddle/paddleLoader";
import { BuyCreditsModal } from "@/components/app/BuyCreditsModal";

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

interface CreditBalanceData {
  orgId: string | null;
  plan: string;
  planIncluded: number;
  remaining: number;
  purchased: number;
  consumed: number;
  available: number;
  canPurchase: boolean;
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
  const t = useTranslations("console.billing");
  const { data: session, update: updateSession } = useSession();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const { plans: fetchedPlans, loading, currencySymbol } = usePricingPlans();

  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [credits, setCredits] = useState<CreditBalanceData | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

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

  // Credit balance — refreshed alongside billing so a post-checkout
  // refresh (from PaddleLoader's session update + router.refresh)
  // picks up newly credited packs without a manual reload.
  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (res.ok) {
        const data = (await res.json()) as CreditBalanceData;
        setCredits(data);
        setOrgId(data.orgId);
      }
    } catch {
      // Silent — credits card just stays hidden
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

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
        toast.error(t("errors.payment_loading"));
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
    [session, t],
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
          toast.success(t("errors.plan_changed"));
          // Refresh session so next-auth re-runs the jwt callback and picks
          // up the plan change written by the webhook/API. `update()` is the
          // NextAuth v4 idiomatic refresh; the legacy `signIn("fetchSession")`
          // path was removed as a security vulnerability.
          await updateSession();
          await fetchBilling();
        } else {
          const data = await res.json();
          toast.error(data.message || t("errors.plan_change_failed"));
        }
      } catch {
        toast.error(t("errors.network_error"));
      } finally {
        setActionLoading(false);
        setShowManageMenu(false);
      }
    },
    [billing, fetchBilling, t],
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
        toast.success(t("errors.subscription_canceled"));
        // Same rationale as handleChangePlan — re-read JWT from DB post-action.
        await updateSession();
        await fetchBilling();
      } else {
        const data = await res.json();
        toast.error(data.message || t("errors.cancel_failed"));
      }
    } catch {
      toast.error(t("errors.network_error"));
    } finally {
      setActionLoading(false);
      setShowCancelConfirm(false);
      setShowManageMenu(false);
    }
  }, [billing, fetchBilling, t]);

  // ──────────────────────────────────────────────
  // Plan Selection — routes to checkout or change-plan
  // ──────────────────────────────────────────────

  const handlePlanSelect = useCallback(
    (planId: string, _billingCycle: BillingCycle) => {
      if (planId === currentPlanId) return;

      // Find the paddlePriceId for the selected plan
      const targetPlan = pricingPlans.find((p) => p.key === planId);
      if (!targetPlan?.paddlePriceId) {
        toast.error(t("errors.plan_unavailable"));
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
    [currentPlanId, pricingPlans, billing, handleChangePlan, openPaddleCheckout, t],
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
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("subtitle")}
        </p>
      </div>

      {/* Current Plan Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
            {t("current_plan")}
          </h2>
          <div className="space-y-3">
            {[
              {
                label: t("plan"),
                value: billingLoading ? t("loading") : planLabel(currentPlanId),
              },
              {
                label: t("price"),
                value: billingLoading
                  ? t("loading")
                  : currentPlan
                    ? `$${currentPlan.priceMonthly}/mo`
                    : "—",
              },
              {
                label: t("renewal_date"),
                value: billingLoading
                  ? t("loading")
                  : formatDate(billing?.currentPeriodEnd || null),
              },
              {
                label: t("account"),
                value: session?.user?.email || "—",
              },
              {
                label: t("status"),
                value: billingLoading
                  ? t("loading")
                  : billing?.subscriptionId
                    ? t("active")
                    : t("no_subscription"),
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
                  {actionLoading ? t("processing") : t("manage_subscription")}
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
                      {t("change_plan")}
                    </button>
                    <button
                      onClick={() => {
                        setShowManageMenu(false);
                        setShowCancelConfirm(true);
                      }}
                      className="w-full border-t border-edge px-4 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-surface-card-hover"
                    >
                      {t("cancel_subscription")}
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
                {t("subscribe_to_plan")}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
            {t("usage_period")}
          </h2>
          <div className="space-y-3">
            {[
              {
                label: t("agentic_insights"),
                used: billingLoading ? "..." : String(billing?.usage.mcpQueries ?? 0),
                total: billingLoading ? "..." : String(billing?.usage.maxMcpQueries ?? "—"),
              },
              {
                label: t("environments"),
                used: billingLoading ? "..." : String(billing?.usage.environments ?? 0),
                total: billingLoading ? "..." : String(billing?.usage.maxEnvironments ?? "—"),
              },
              {
                label: t("team_members"),
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

      {/* Verification Credits — shown for Pro + Max, since both have
          plan-included credits. Buy CTA only for Max (gated inside the
          modal) — Pro sees the balance but gets the upgrade nudge when
          they try to purchase. Starter has 0 credits so we hide the
          whole section. */}
      {credits && credits.planIncluded > 0 && (
        <section className="mt-6 rounded-lg border border-edge bg-surface-card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
                {t("credits.section_title")}
              </h2>
              <p className="mt-1 text-sm text-content-muted">
                {t("credits.section_subtitle")}
              </p>
            </div>
            {credits.canPurchase && (
              <button
                onClick={() => setShowCreditsModal(true)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                {t("credits.buy_more")}
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-content-muted">
                {t("credits.balance_available")}
              </div>
              <div className="mt-1 text-xl font-semibold text-content">
                {credits.available.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-content-muted">
                {t("credits.balance_included")}
              </div>
              <div className="mt-1 text-xl font-semibold text-content-secondary">
                {credits.planIncluded.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-content-muted">
                {t("credits.balance_purchased")}
              </div>
              <div className="mt-1 text-xl font-semibold text-content-secondary">
                {credits.purchased.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-content-muted">
                {t("credits.balance_consumed")}
              </div>
              <div className="mt-1 text-xl font-semibold text-content-secondary">
                {credits.consumed.toLocaleString()}
              </div>
            </div>
          </div>
        </section>
      )}

      <BuyCreditsModal
        open={showCreditsModal}
        onClose={() => {
          setShowCreditsModal(false);
          // Re-pull balance shortly after close — catches both the
          // "user bought something" case and the "user canceled" case
          // equivalently. Deferred 1.5s so the Paddle checkout.completed
          // webhook has time to land before we refetch.
          setTimeout(() => fetchCredits(), 1500);
        }}
        planKey={credits?.plan || "vestigio"}
        orgId={orgId}
      />

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border border-edge bg-surface-card p-6">
            <h3 className="text-lg font-semibold text-content">
              {t("cancel_modal_title")}
            </h3>
            <p className="mt-2 text-sm text-content-muted">
              {t("cancel_modal_text", { plan: planLabel(currentPlanId) })}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={actionLoading}
                className="rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-50"
              >
                {t("keep_subscription")}
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? t("canceling") : t("confirm_cancellation")}
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
            currencySymbol={currencySymbol}
            heading={t("compare_plans")}
            subheading={t("compare_plans_subtitle")}
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
