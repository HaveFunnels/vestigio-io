import Home from "@/components/Home";
import { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits, Monitoring & Optimization",
	description:
		"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights — all in one intelligent engine.",
	openGraph: {
		type: "website",
		title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits & Optimization",
		description:
			"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights.",
		images: [
			{
				url: "https://vestigio.io/images/logo/logo-light.png",
				width: 1200,
				height: 630,
				alt: "Vestigio — Decision Engine for Revenue Leakage",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits & Optimization",
		description:
			"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights.",
		images: ["https://vestigio.io/images/logo/logo-light.png"],
	},
};

export default function HomePage() {
	return (
		<main>
			<Home />
		</main>
	);
}
