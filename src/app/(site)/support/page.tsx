import React from "react";
import Support from "@/components/Support";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Support — Vestigio",
	description: "Get help and contact our support team. We're here to assist you with any questions about Vestigio.",
	openGraph: {
		title: "Support — Vestigio",
		description: "Get help and contact our support team. We're here to assist you with any questions about Vestigio.",
	},
	twitter: {
		card: "summary",
		title: "Support — Vestigio",
		description: "Get help and contact our support team. We're here to assist you with any questions about Vestigio.",
	},
};

const SupportPage = () => {
	return (
		<main>
			<Support />
		</main>
	);
};

export default SupportPage;
