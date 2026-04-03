import Home from "@/components/Home";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Vestigio — Intelligence & Decision Engine for SaaS",
	description:
		"Vestigio is the intelligence layer that audits, monitors, and optimizes your SaaS platform. Automated analysis, evidence-based decisions, and actionable insights.",
	openGraph: {
		type: "website",
		title: "Vestigio — Intelligence & Decision Engine for SaaS",
		description:
			"Vestigio is the intelligence layer that audits, monitors, and optimizes your SaaS platform. Automated analysis, evidence-based decisions, and actionable insights.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — Intelligence & Decision Engine for SaaS",
		description:
			"Vestigio is the intelligence layer that audits, monitors, and optimizes your SaaS platform. Automated analysis, evidence-based decisions, and actionable insights.",
	},
};

export default function HomePage() {
	return (
		<main>
			<Home />
		</main>
	);
}
