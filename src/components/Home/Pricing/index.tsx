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
  const { plans, loading } = usePricingPlans();

  const handlePlanSelect = () => {
    router.push("/auth/signup");
  };

  if (loading) return null;

  return (
    <section id="pricing" className="border-t border-white/5 bg-[#090911]">
      <PricingComponent
        plans={plans || FALLBACK_PLANS}
        billingCycle={cycle}
        onCycleChange={setCycle}
        onPlanSelect={handlePlanSelect}
        heading="Veja exatamente o que est&aacute; perdendo. Corrija. Escale."
        subheading="Intelig&ecirc;ncia que se paga sozinha. Comece gr&aacute;tis, evolua quando quiser."
      />
      <SocialProof />
      <ROICalculator />
      <PricingFAQ />
      <FinalCTA />
    </section>
  );
};

export default HomePricing;
