"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { MpLoader } from "@/mp/MpLoader";
import { MpCheckoutModal } from "@/mp/MpCheckoutModal";
import { MpPixChargePanel, type PixChargeData } from "@/mp/MpPixChargePanel";
import { BuyCreditsModal } from "@/components/app/BuyCreditsModal";
import { annualPriceCentsFromMonthly } from "@/libs/plan-config";

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
  activeProvider: "mercadopago" | "paddle";
  userProvider: "mercadopago" | "paddle" | null;
  mpPreapprovalId: string | null;
  pixCharge: PixChargeData | null;
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
  paddleAnnualPriceId: string;
  mpPreapprovalPlanId?: string;
  mpAnnualPreapprovalPlanId?: string;
  monthlyPriceCents: number;
  monthlyPriceCentsBrl?: number;
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
  // MP checkout state — opens with a target plan/cycle when the user
  // clicks a plan in the comparison grid (and the active provider is MP).
  // All three are paid tiers; "free" is the lapsed status, no checkout.
  const [mpCheckout, setMpCheckout] = useState<
    | null
    | {
        planKey: "vestigio" | "pro" | "max";
        planLabel: string;
        cycle: BillingCycle;
        amountCentsBrl: number;
        mode: "subscribe" | "change";
      }
  >(null);

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

  const currentPlanId = billing?.plan || "free";
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
    async (
      planKey: "vestigio" | "pro" | "max",
      cadence: "monthly" | "annual",
    ) => {
      if (!billing?.subscriptionId) return;

      setActionLoading(true);
      try {
        // planKey + cadence only — server resolves the current Paddle
        // priceId. Passing a raw priceId lets a client submit a legacy
        // or promo id that still maps to a paid tier, billed at the
        // cheaper legacy amount. See resolvePriceIdForPlan for the
        // full rationale (P1.5).
        const res = await fetch("/api/paddle/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionId: billing.subscriptionId,
            planKey,
            cadence,
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
  // Cancel Subscription — routes to the provider that owns the sub.
  //  MP: /api/mercadopago/cancel (resolves the preapproval server-side).
  //  Paddle: /api/paddle/cancel-subscription (legacy users).
  // ──────────────────────────────────────────────

  const handleCancelSubscription = useCallback(async () => {
    if (!billing?.subscriptionId) return;

    setActionLoading(true);
    try {
      const cancelUrl =
        billing.userProvider === "mercadopago"
          ? "/api/mercadopago/cancel"
          : "/api/paddle/cancel-subscription";
      const cancelBody =
        billing.userProvider === "mercadopago"
          ? {}
          : { subscriptionId: billing.subscriptionId };
      const res = await fetch(cancelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cancelBody),
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
    (planId: string, billingCycle: BillingCycle) => {
      if (planId === currentPlanId) return;
      if (planId !== "vestigio" && planId !== "pro" && planId !== "max") return;

      const targetPlan = pricingPlans.find((p) => p.key === planId);
      if (!targetPlan) {
        toast.error(t("errors.plan_unavailable"));
        return;
      }

      // Decide which provider runs this checkout:
      //   - Existing sub → userProvider (don't migrate them mid-flow)
      //   - No sub        → activeProvider (locked to Paddle 2026-07-20;
      //                     see src/libs/payment-provider.ts)
      const provider: "mercadopago" | "paddle" =
        (billing?.userProvider as any) ||
        (billing?.activeProvider as any) ||
        "paddle";

      if (provider === "mercadopago") {
        const mpPlanId =
          billingCycle === "annually" && targetPlan.mpAnnualPreapprovalPlanId
            ? targetPlan.mpAnnualPreapprovalPlanId
            : targetPlan.mpPreapprovalPlanId;
        if (!mpPlanId) {
          toast.error(t("errors.plan_unavailable"));
          return;
        }
        // -20% annual via canonical helper (× 9.6). Prior × 10 hardcode
        // silently charged -17% while UI badge promised -20%.
        const amountCentsBrl =
          billingCycle === "annually"
            ? annualPriceCentsFromMonthly(targetPlan.monthlyPriceCentsBrl ?? 0)
            : targetPlan.monthlyPriceCentsBrl ?? 0;
        setMpCheckout({
          planKey: planId as "vestigio" | "pro" | "max",
          planLabel: targetPlan.label,
          cycle: billingCycle,
          amountCentsBrl,
          mode: billing?.subscriptionId ? "change" : "subscribe",
        });
        return;
      }

      // Paddle branch (legacy users)
      const paddleCadence: "monthly" | "annual" =
        billingCycle === "annually" ? "annual" : "monthly";
      // Existing-subscription change path: server resolves the priceId
      // by (planKey, cadence). The new-checkout path (openPaddleCheckout)
      // still needs a concrete priceId since Paddle.Checkout.open()
      // takes it directly — no server intake to resolve through.
      // resolvePlanFromPriceId in the webhook still whitelists incoming
      // priceIds against the current plan catalog so a manipulated
      // Paddle Checkout URL can't grant a mis-mapped tier.
      if (billing?.subscriptionId) {
        handleChangePlan(planId as "vestigio" | "pro" | "max", paddleCadence);
      } else {
        const targetPriceId =
          paddleCadence === "annual" && targetPlan.paddleAnnualPriceId
            ? targetPlan.paddleAnnualPriceId
            : targetPlan.paddlePriceId;
        if (!targetPriceId) {
          toast.error(t("errors.plan_unavailable"));
          return;
        }
        openPaddleCheckout(targetPriceId);
      }
    },
    [currentPlanId, pricingPlans, billing, handleChangePlan, openPaddleCheckout, t],
  );

  // Show the Monthly/Annual toggle only when EVERY plan has a synced
  // annual priceId. Until paddle-sync provisions them, the toggle
  // stays hidden so users don't pick "Annual" for a plan whose annual
  // id is empty (which would silently fall back to monthly billing —
  // the original #5 bug).
  const isAnnualPriceReady = useMemo(
    () => pricingPlans.length > 0 && pricingPlans.every((p) => !!p.paddleAnnualPriceId),
    [pricingPlans],
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
      free: "Free",
      vestigio: "Vestigio Starter",
      pro: "Vestigio Pro",
      max: "Vestigio Max",
    };
    return labels[key] || key;
  };

  // Provider that drives THIS page's UI. Existing sub → userProvider
  // (MP subscribers still see MP management UI), else activeProvider
  // (locked to Paddle 2026-07-20). Loaders + modals are gated on this.
  const uiProvider: "mercadopago" | "paddle" =
    (billing?.userProvider as any) ||
    (billing?.activeProvider as any) ||
    "paddle";

  return (
    <div className="p-6">
      {/* Load the SDK matching whichever provider drives this page */}
      {uiProvider === "mercadopago" ? <MpLoader /> : <PaddleLoader />}

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("subtitle")}
        </p>
      </div>

      {/* Pending PIX renewal — shown above current-plan block when MP
          has a charge in flight. Polls /check-pix-status until approved. */}
      {billing?.pixCharge && (
        <MpPixChargePanel
          charge={billing.pixCharge}
          onPaid={() => {
            updateSession();
            fetchBilling();
          }}
        />
      )}

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
            annualPricingEnabled={isAnnualPriceReady}
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

      {/* MP Checkout Modal — opens when handlePlanSelect routes a plan
          to the MP provider branch. Closes on success + refreshes
          session/billing so the post-checkout state lands without a
          full reload. */}
      {mpCheckout && (
        <MpCheckoutModal
          open={true}
          onClose={() => setMpCheckout(null)}
          onSuccess={async () => {
            setMpCheckout(null);
            await new Promise((r) => setTimeout(r, 800)); // let webhook commit
            await updateSession();
            await fetchBilling();
          }}
          planKey={mpCheckout.planKey}
          planLabel={mpCheckout.planLabel}
          cycle={mpCheckout.cycle}
          amountCentsBrl={mpCheckout.amountCentsBrl}
          mode={mpCheckout.mode}
        />
      )}
    </div>
  );
}
