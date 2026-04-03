import React from "react";
import Support from "@/components/Support";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Support",
	description: "Get help and contact our support team",
};

const SupportPage = () => {
	return (
		<main>
			<Support />
		</main>
	);
};

export default SupportPage;
