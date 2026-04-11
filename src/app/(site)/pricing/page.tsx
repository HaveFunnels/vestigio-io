import HomePricing from "@/components/Home/Pricing";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Pricing — Vestigio",
	description: "Simple, transparent pricing. Intelligence that pays for itself.",
	openGraph: {
		type: "website",
		title: "Pricing — Vestigio",
		description: "Simple, transparent pricing for SaaS intelligence. Plans that scale with your platform and pay for themselves.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Pricing — Vestigio",
		description: "Simple, transparent pricing for SaaS intelligence. Plans that scale with your platform and pay for themselves.",
	},
};

export default function PricingPage() {
	return (
		<main className="bg-[#090911] pt-32">
			<HomePricing />
		</main>
	);
}
