import HomePricing from "@/components/Home/Pricing";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Pricing — Vestigio",
	description: "Simple, transparent pricing. Intelligence that pays for itself.",
};

export default function PricingPage() {
	return (
		<main className="bg-[#090911] pt-32">
			<HomePricing />
		</main>
	);
}
