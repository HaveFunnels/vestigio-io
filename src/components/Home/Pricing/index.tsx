"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
} from "@/components/ui/pricing-card";
import SocialProof from "@/components/shared/SocialProof";
import ROICalculator from "@/components/shared/ROICalculator";
import PricingFAQ from "@/components/shared/PricingFAQ";
import FinalCTA from "@/components/shared/FinalCTA";

const HomePricing = () => {
  const [cycle, setCycle] = useState<BillingCycle>("annually");
  const router = useRouter();
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
        heading="Veja exatamente o que est&aacute; perdendo. Corrija. Escale."
        subheading="Intelig&ecirc;ncia que se paga sozinha. Comece gr&aacute;tis, evolua quando quiser."
        annualPricingEnabled={annualReady}
      />
      <SocialProof />
      <ROICalculator />
      <PricingFAQ />
      <FinalCTA />
    </section>
  );
};

export default HomePricing;
