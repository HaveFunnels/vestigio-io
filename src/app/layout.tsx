import { BrandingProvider } from "@/components/BrandingProvider";
import { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "../styles/globals.css";
import "../styles/satoshi.css";

export const metadata: Metadata = {
	icons: [
		{
			rel: "icon",
			url: "/images/favicon-light.ico",
			media: "(prefers-color-scheme: light)",
		},
		{
			rel: "icon",
			url: "/images/favicon-dark.ico",
			media: "(prefers-color-scheme: dark)",
		},
	],
	title: {
		default: "Vestigio — Intelligence & Decision Engine for SaaS",
		template: "%s | Vestigio",
	},
	description:
		"Vestigio is the intelligence layer that audits, monitors, and optimizes your SaaS platform.",
	openGraph: {
		type: "website",
		siteName: "Vestigio",
		title: "Vestigio — Intelligence & Decision Engine for SaaS",
		description:
			"Automated analysis, evidence-based decisions, and actionable insights for your SaaS platform.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — Intelligence & Decision Engine for SaaS",
		description:
			"Automated analysis, evidence-based decisions, and actionable insights for your SaaS platform.",
	},
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale} className="dark" suppressHydrationWarning={true}>
			<body className="flex min-h-screen flex-col bg-[#090911] font-satoshi text-white">
				<NextIntlClientProvider messages={messages}>
					<BrandingProvider>
						{children}
					</BrandingProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
