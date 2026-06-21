"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
} from "@/components/ui/pricing-card";
import SocialProof from "@/components/shared/SocialProof";
import ROICalculator from "@/components/shared/ROICalculator";
import PricingFAQ from "@/components/shared/PricingFAQ";
import FinalCTA from "@/components/shared/FinalCTA";
import CadenceFrame from "./CadenceFrame";

const HomePricing = () => {
  const [cycle, setCycle] = useState<BillingCycle>("annually");
  const router = useRouter();
  const t = useTranslations("homepage.pricing_heading");
  const { plans, loading, currencySymbol, annualReady } = usePricingPlans();

  const handlePlanSelect = (planId: string, billingCycle: BillingCycle) => {
    // Path A of the unified funnel: home/pricing → signup → /activate
    // (paywall). We carry plan + cycle through the signup hop via
    // search params so /activate boots with the right tab + tier
    // selected. Signup stashes plan to localStorage to survive the
    // OAuth round-trip.
    const params = new URLSearchParams({
      callbackUrl: "/activate",
      plan: planId,
      cycle: billingCycle,
    });
    router.push(`/auth/signup?${params.toString()}`);
  };

  if (loading) return null;

  return (
    <section id="pricing" className="border-t border-white/5 bg-[#090911]">
      <PricingComponent
        plans={plans || FALLBACK_PLANS}
        billingCycle={cycle}
        onCycleChange={setCycle}
        onPlanSelect={handlePlanSelect}
        currencySymbol={currencySymbol}
        // Heading + subheading localized + restructured to promise the
        // actual deliverable (a monthly Plano de Estratégia with PDF
        // export, share link, cycle cadence) instead of the old
        // urgency/anxiety frame ("veja o que está perdendo, corrija,
        // escale"). Cohesion with the rest of the homepage editorial
        // surfaces.
        heading={t("heading")}
        subheading={t("subheading")}
        annualPricingEnabled={annualReady}
      />
      {/* Cadence objection-handler — sits between tiers and social proof
          to address "why monthly, not real-time?" before the social-proof
          row reinforces the choice via others. */}
      <CadenceFrame />
      <SocialProof />
      {/* ROI calculator and the bottom Final CTA both default to the
          paywall-aware signup URL (see their own files). No override
          needed here — every "Começar agora" is buying intent now. */}
      <ROICalculator />
      <PricingFAQ />
      <FinalCTA />
    </section>
  );
};

export default HomePricing;
