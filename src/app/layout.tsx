import { BrandingProvider } from "@/components/BrandingProvider";
import JsonLd from "@/components/SEO/JsonLd";
import { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "../styles/globals.css";
import "../styles/satoshi.css";

// JetBrains Mono — used exclusively for numbers across the dashboard
// (counters, deltas, percentages, durations). Loaded via next/font so
// the file lives on the same domain as the app, FOIT is suppressed
// during swap, and the resulting CSS variable hooks straight into the
// Tailwind `font-mono` family. Adding a Google font here intentionally
// — Satoshi (loaded via the satoshi.css file above) stays the default
// sans for prose; this is the second face for tabular numbers.
const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains-mono",
	display: "swap",
});

// Geist — Vercel's grotesk with sharp angular terminals and tight
// metrics. Recommended by the taste-skill guidelines as the top pick
// for premium headline typography. Used exclusively for the hero h1
// via the `font-display` Tailwind utility; the rest of the site stays
// on Satoshi for body + JetBrains Mono for numbers.
const geist = Geist({
	subsets: ["latin"],
	variable: "--font-display",
	display: "swap",
});

export const viewport: Viewport = {
	viewportFit: "cover",
};

export const metadata: Metadata = {
	metadataBase: new URL("https://vestigio.io"),
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
		default: "Vestigio — Descubra onde seu site perde dinheiro",
		template: "%s | Vestigio",
	},
	description:
		"Vestigio mostra exatamente onde seu site perde receita, quanto custa, e o que corrigir primeiro.",
	alternates: {
		canonical: "/",
		languages: {
			"en": "/",
			"pt-BR": "/",
			"es": "/",
			"de": "/",
		},
	},
	openGraph: {
		type: "website",
		siteName: "Vestigio",
		title: "Vestigio — Descubra onde seu site perde dinheiro",
		description:
			"Descubra quanto dinheiro seu site perde entre o clique e a conversão. Diagnóstico gratuito em 60 segundos.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — Descubra onde seu site perde dinheiro",
		description:
			"Descubra quanto dinheiro seu site perde entre o clique e a conversão. Diagnóstico gratuito em 60 segundos.",
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
		<html lang={locale} className={`dark ${jetbrainsMono.variable} ${geist.variable}`} suppressHydrationWarning={true}>
			<head>
				{/* Preconnect to CDN — eliminates DNS+TLS on first video/image load */}
				{process.env.NEXT_PUBLIC_CDN_URL && (
					<>
						<link rel="preconnect" href={process.env.NEXT_PUBLIC_CDN_URL} />
						<link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_CDN_URL} />
					</>
				)}
			</head>
			<body className="flex min-h-screen flex-col bg-[#090911] font-satoshi text-white">
				<JsonLd />
				<NextIntlClientProvider messages={messages}>
					<BrandingProvider>
						{children}
					</BrandingProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
