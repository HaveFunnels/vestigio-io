"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PricingComponent, {
  usePricingPlans,
  FALLBACK_PLANS,
  type BillingCycle,
} from "@/components/ui/pricing-card";

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
        heading="Simple, Transparent Pricing"
        subheading="Intelligence that pays for itself. Start with a free trial, upgrade when you're ready."
      />
    </section>
  );
};

export default HomePricing;
