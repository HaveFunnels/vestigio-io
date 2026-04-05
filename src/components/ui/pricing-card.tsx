"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/libs/utils";
import { Check, X } from "lucide-react";

// --- Types ---

type BillingCycle = "monthly" | "annually";

interface Feature {
  name: string;
  isIncluded: boolean;
}

interface PriceTier {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnually: number;
  isPopular: boolean;
  isCurrent?: boolean;
  buttonLabel: string;
  features: Feature[];
}

interface PricingComponentProps {
  plans: [PriceTier, PriceTier, PriceTier];
  billingCycle: BillingCycle;
  onCycleChange: (cycle: BillingCycle) => void;
  onPlanSelect: (planId: string, cycle: BillingCycle) => void;
  heading?: string;
  subheading?: string;
  className?: string;
}

// --- Feature Row ---

const FeatureItem: React.FC<{ feature: Feature }> = ({ feature }) => {
  const Icon = feature.isIncluded ? Check : X;
  return (
    <li className="flex items-start gap-3 py-1.5">
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 mt-0.5",
          feature.isIncluded ? "text-emerald-400" : "text-zinc-600"
        )}
      />
      <span
        className={cn(
          "text-sm",
          feature.isIncluded ? "text-zinc-200" : "text-zinc-500 line-through"
        )}
      >
        {feature.name}
      </span>
    </li>
  );
};

// --- Animated Price ---

function AnimatedPrice({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef(display);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (value === display) return;
    startRef.current = display;
    startTimeRef.current = performance.now();
    const duration = 400;

    function tick(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startRef.current + (value - startRef.current) * eased);
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [value]);

  return <>{display}</>;
}

// --- Main Component ---

export default function PricingComponent({
  plans,
  billingCycle,
  onCycleChange,
  onPlanSelect,
  heading = "Choose the right plan for your business.",
  subheading = "Scale effortlessly with intelligence designed for growth, from startups to enterprise.",
  className,
}: PricingComponentProps) {
  const annualDiscountPercent = 20;
  const allFeatures = Array.from(
    new Set(plans.flatMap((p) => p.features.map((f) => f.name)))
  );

  return (
    <div className={cn("w-full py-16 md:py-24", className)}>
      {/* Header */}
      <div className="mx-auto mb-10 max-w-2xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-3 text-base text-zinc-400">{subheading}</p>
      </div>

      {/* Cycle Toggle */}
      <div className="mb-12 flex justify-center">
        <div className="relative inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {/* Sliding highlight */}
          <div
            className="absolute top-1 bottom-1 rounded-md bg-white/10 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              left: billingCycle === "monthly" ? "4px" : "50%",
              width: "calc(50% - 4px)",
            }}
          />
          <button
            onClick={() => onCycleChange("monthly")}
            className={cn(
              "relative z-10 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-200",
              billingCycle === "monthly"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => onCycleChange("annually")}
            className={cn(
              "relative z-10 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-200",
              billingCycle === "annually"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Annually
          </button>
          {/* Save badge — fades in on annual */}
          <span
            className={cn(
              "absolute -right-14 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 transition-all duration-300",
              billingCycle === "annually" ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
            )}
          >
            Save {annualDiscountPercent}%
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="mx-auto grid max-w-[1170px] gap-6 px-4 sm:px-8 md:grid-cols-3 xl:px-0">
        {plans.map((plan) => {
          const price =
            billingCycle === "monthly"
              ? plan.priceMonthly
              : plan.priceAnnually;
          const suffix = billingCycle === "monthly" ? "/mo" : "/yr";

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 transition-all duration-300",
                plan.isPopular
                  ? "border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10 md:scale-[1.03]"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              )}
            >
              {/* Popular badge */}
              {plan.isPopular && (
                <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              {/* Current plan badge */}
              {plan.isCurrent && (
                <span className="absolute -top-3 right-6 rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300">
                  Current Plan
                </span>
              )}

              {/* Name & description */}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>

              {/* Price */}
              <div className="mt-5">
                <span className="text-4xl font-extrabold text-white">
                  $<AnimatedPrice value={price} />
                </span>
                <span className="ml-1 text-sm text-zinc-400">{suffix}</span>
                <p className={cn(
                  "mt-1 text-xs text-zinc-500 line-through transition-all duration-300",
                  billingCycle === "annually" ? "h-4 opacity-100" : "h-0 opacity-0"
                )}>
                  ${plan.priceMonthly}/mo
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={() => onPlanSelect(plan.id, billingCycle)}
                disabled={plan.isCurrent}
                className={cn(
                  "mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                  plan.isCurrent
                    ? "cursor-default border border-zinc-700 bg-zinc-800 text-zinc-500"
                    : plan.isPopular
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
                      : "border border-zinc-700 bg-white/5 text-white hover:bg-white/10"
                )}
              >
                {plan.isCurrent ? "Current Plan" : plan.buttonLabel}
              </button>

              {/* Features */}
              <div className="mt-6 border-t border-zinc-800 pt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  What&apos;s included
                </p>
                <ul>
                  {plan.features.map((f) => (
                    <FeatureItem key={f.name} feature={f} />
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table (desktop) */}
      <div className="mx-auto mt-16 hidden max-w-[1170px] px-4 sm:px-8 md:block xl:px-0">
        <h3 className="mb-6 text-center text-xl font-bold text-white">
          Detailed Feature Comparison
        </h3>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-zinc-400">
                  Feature
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    className={cn(
                      "px-6 py-4 text-center text-sm font-semibold",
                      plan.isPopular
                        ? "bg-emerald-500/5 text-emerald-400"
                        : "text-zinc-400"
                    )}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((name, i) => (
                <tr
                  key={name}
                  className={cn(
                    "border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30",
                    i % 2 === 0 ? "bg-transparent" : "bg-zinc-900/20"
                  )}
                >
                  <td className="px-6 py-3 text-sm text-zinc-300">{name}</td>
                  {plans.map((plan) => {
                    const included = plan.features.find(
                      (f) => f.name === name
                    )?.isIncluded;
                    const Icon = included ? Check : X;
                    return (
                      <td
                        key={`${plan.id}-${name}`}
                        className={cn(
                          "px-6 py-3 text-center",
                          plan.isPopular && "bg-emerald-500/5"
                        )}
                      >
                        <Icon
                          className={cn(
                            "mx-auto h-4 w-4",
                            included ? "text-emerald-400" : "text-zinc-700"
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- API → PriceTier transformer ---

export interface PublicPlanConfig {
  key: string;
  label: string;
  monthlyPriceCents: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  vestigio: "Essential intelligence for small teams getting started.",
  pro: "Full analysis suite for growing businesses that need an edge.",
  max: "Unlimited scale with dedicated support for large organizations.",
};

const PLAN_CTA: Record<string, string> = {
  vestigio: "Start Free Trial",
  pro: "Choose Pro",
  max: "Contact Sales",
};

/** Derive feature list from admin-configured plan limits */
function buildFeatures(plan: PublicPlanConfig, allPlans: PublicPlanConfig[]): Feature[] {
  const tierIndex = allPlans.indexOf(plan);
  const isTop = tierIndex === allPlans.length - 1;
  const isMid = tierIndex === 1;

  const envLabel = plan.maxEnvironments >= 100
    ? "Unlimited environments"
    : `${plan.maxEnvironments} environment${plan.maxEnvironments > 1 ? "s" : ""}`;
  const memberLabel = plan.maxMembers >= 100
    ? "Unlimited team members"
    : `Up to ${plan.maxMembers} team member${plan.maxMembers > 1 ? "s" : ""}`;

  return [
    { name: envLabel, isIncluded: true },
    { name: memberLabel, isIncluded: true },
    { name: plan.continuousAudits ? "Daily audit cycles" : "Weekly audit cycles", isIncluded: true },
    { name: isTop ? "Full analysis suite" : isMid ? "Advanced findings & actions" : "Core findings & actions", isIncluded: true },
    { name: tierIndex === 0 ? "Agentic insights" : tierIndex === 1 ? "5x more agentic insights" : "20x more agentic insights", isIncluded: true },
    { name: isTop ? "Dedicated account manager" : isMid ? "Priority support" : "Email support", isIncluded: true },
    { name: "AI Chat assistant", isIncluded: isMid || isTop },
    { name: "Revenue integrity maps", isIncluded: isMid || isTop },
    { name: "Custom integrations", isIncluded: isMid || isTop },
    { name: "SSO / SAML", isIncluded: isTop },
    { name: "SLA guarantee", isIncluded: isTop },
  ];
}

/** Transform API plan configs into PriceTier array for the pricing card */
export function planConfigsToPriceTiers(
  configs: PublicPlanConfig[],
): [PriceTier, PriceTier, PriceTier] | null {
  if (configs.length < 3) return null;

  const plans = configs.slice(0, 3);
  return plans.map((cfg, i) => {
    const monthly = Math.round(cfg.monthlyPriceCents / 100);
    const annually = Math.round(monthly * 12 * 0.8); // 20% annual discount
    return {
      id: cfg.key,
      name: cfg.label,
      description: PLAN_DESCRIPTIONS[cfg.key] || cfg.label,
      priceMonthly: monthly,
      priceAnnually: annually,
      isPopular: i === 1,
      buttonLabel: PLAN_CTA[cfg.key] || "Get Started",
      features: buildFeatures(cfg, plans),
    };
  }) as [PriceTier, PriceTier, PriceTier];
}

// --- Hook to fetch pricing from API ---

export function usePricingPlans() {
  const [plans, setPlans] = useState<[PriceTier, PriceTier, PriceTier] | null>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((data) => {
        const tiers = planConfigsToPriceTiers(data.plans);
        if (tiers) setPlans(tiers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { plans, loading };
}

// --- Static fallback (used only if API is unavailable) ---

export const FALLBACK_PLANS: [PriceTier, PriceTier, PriceTier] = [
  {
    id: "vestigio", name: "Vestigio", description: PLAN_DESCRIPTIONS.vestigio,
    priceMonthly: 99, priceAnnually: 950, isPopular: false, buttonLabel: "Start Free Trial",
    features: [
      { name: "1 environment", isIncluded: true },
      { name: "Up to 1 team member", isIncluded: true },
      { name: "Weekly audit cycles", isIncluded: true },
      { name: "Core findings & actions", isIncluded: true },
      { name: "Agentic insights", isIncluded: true },
      { name: "Email support", isIncluded: true },
      { name: "AI Chat assistant", isIncluded: false },
      { name: "Revenue integrity maps", isIncluded: false },
      { name: "Custom integrations", isIncluded: false },
      { name: "SSO / SAML", isIncluded: false },
      { name: "SLA guarantee", isIncluded: false },
    ],
  },
  {
    id: "pro", name: "Vestigio Pro", description: PLAN_DESCRIPTIONS.pro,
    priceMonthly: 199, priceAnnually: 1910, isPopular: true, buttonLabel: "Choose Pro",
    features: [
      { name: "3 environments", isIncluded: true },
      { name: "Up to 3 team members", isIncluded: true },
      { name: "Daily audit cycles", isIncluded: true },
      { name: "Advanced findings & actions", isIncluded: true },
      { name: "5x more agentic insights", isIncluded: true },
      { name: "Priority support", isIncluded: true },
      { name: "AI Chat assistant", isIncluded: true },
      { name: "Revenue integrity maps", isIncluded: true },
      { name: "Custom integrations", isIncluded: true },
      { name: "SSO / SAML", isIncluded: false },
      { name: "SLA guarantee", isIncluded: false },
    ],
  },
  {
    id: "max", name: "Vestigio Max", description: PLAN_DESCRIPTIONS.max,
    priceMonthly: 399, priceAnnually: 3830, isPopular: false, buttonLabel: "Contact Sales",
    features: [
      { name: "10 environments", isIncluded: true },
      { name: "Up to 10 team members", isIncluded: true },
      { name: "Daily audit cycles", isIncluded: true },
      { name: "Full analysis suite", isIncluded: true },
      { name: "20x more agentic insights", isIncluded: true },
      { name: "Dedicated account manager", isIncluded: true },
      { name: "AI Chat assistant", isIncluded: true },
      { name: "Revenue integrity maps", isIncluded: true },
      { name: "Custom integrations", isIncluded: true },
      { name: "SSO / SAML", isIncluded: true },
      { name: "SLA guarantee", isIncluded: true },
    ],
  },
];

export type { PriceTier, BillingCycle, Feature, PricingComponentProps, PublicPlanConfig };
