import { BrandingProvider } from "@/components/BrandingProvider";
import JsonLd from "@/components/SEO/JsonLd";
import { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "../styles/globals.css";

// Satoshi — body face. Previously loaded via a hand-written
// satoshi.css with 10 @font-face declarations. That pattern doesn't
// emit <link rel="preload">, so the browser only discovers the font
// AFTER parsing the CSS, which pushes LCP later. Switching to
// next/font/local gives us:
//   1. Automatic preload hints in <head> (LCP-critical body text)
//   2. Self-hosted with content-hash URLs (cache-friendly)
//   3. font-display: swap so text never hides behind invisible glyphs
// The CSS variable hooks into Tailwind's font-satoshi/font-sans.
const satoshi = localFont({
	src: [
		{ path: "../fonts/Satoshi-Light.woff2",       weight: "300", style: "normal" },
		{ path: "../fonts/Satoshi-LightItalic.woff2", weight: "300", style: "italic" },
		{ path: "../fonts/Satoshi-Regular.woff2",     weight: "400", style: "normal" },
		{ path: "../fonts/Satoshi-Italic.woff2",      weight: "400", style: "italic" },
		{ path: "../fonts/Satoshi-Medium.woff2",      weight: "500", style: "normal" },
		{ path: "../fonts/Satoshi-MediumItalic.woff2",weight: "500", style: "italic" },
		{ path: "../fonts/Satoshi-Bold.woff2",        weight: "700", style: "normal" },
		{ path: "../fonts/Satoshi-BoldItalic.woff2",  weight: "700", style: "italic" },
		{ path: "../fonts/Satoshi-Black.woff2",       weight: "900", style: "normal" },
		{ path: "../fonts/Satoshi-BlackItalic.woff2", weight: "900", style: "italic" },
	],
	variable: "--font-satoshi",
	display: "swap",
	preload: true,
	fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

// JetBrains Mono — used exclusively for numbers across the dashboard
// (counters, deltas, percentages, durations). Loaded via next/font so
// the file lives on the same domain as the app, FOIT is suppressed
// during swap, and the resulting CSS variable hooks straight into the
// Tailwind `font-mono` family. Satoshi (loaded above via
// next/font/local) stays the default sans for prose; this is the
// second face for tabular numbers.
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

// Viewport — exported explicitly with width + initialScale so the
// mobile-friendly meta tag always lands in the HTML, even if Next's
// implicit default ever changes. The previous viewport export only
// set `viewportFit: "cover"`, which made SEO auditors miss the
// width=device-width hint and flag the site as not mobile-friendly.
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
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
		<html lang={locale} className={`dark ${satoshi.variable} ${jetbrainsMono.variable} ${geist.variable}`} suppressHydrationWarning={true}>
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
