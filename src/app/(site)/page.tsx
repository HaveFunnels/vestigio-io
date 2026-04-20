import Home from "@/components/Home";
import { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
	title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits, Monitoring & Optimization",
	description:
		"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights — all in one intelligent engine.",
	openGraph: {
		type: "website",
		title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits & Optimization",
		description:
			"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — SaaS Intelligence & Decision Engine | Automated Audits & Optimization",
		description:
			"Vestigio transforms how SaaS teams make decisions. Automated platform audits, real-time monitoring, evidence-based recommendations, and actionable optimization insights.",
	},
};

export default function HomePage() {
	return (
		<main>
			<Home />
		</main>
	);
}
