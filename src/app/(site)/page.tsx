import Home from "@/components/Home";
import { Metadata } from "next";
import { getLocale } from "next-intl/server";

export const revalidate = 3600;

// Per-locale homepage metadata.
//
// Pre-fix the homepage exported a static English Metadata object even
// though the page renders in pt-BR for most visitors. The audit
// flagged: title 103 chars (Google truncates ~60), description 201
// chars (truncates ~155), description-relevance 36%, keyword-relevance
// 0%. All four symptoms had the same root cause: meta written in EN
// while the rendered content is PT.
//
// Resolving locale at request time (generateMetadata + getLocale) and
// picking the matching pair lands the right language AND the right
// length for the crawler that's actually reading the page.
//
// Lengths intentionally sit just under Google's truncation thresholds:
// title ≤ 60 chars, description ≤ 155 chars.
const META_BY_LOCALE: Record<
	string,
	{ title: string; description: string; ogAlt: string }
> = {
	"pt-BR": {
		title: "Vestigio — Onde seu site perde dinheiro, em segundos",
		description:
			"Diagnóstico gratuito em 60 segundos. Vestigio mostra quanto seu site perde por mês e o que corrigir primeiro — em R$, não em cores.",
		ogAlt: "Vestigio — auditoria de conversão que mostra perdas em R$",
	},
	en: {
		title: "Vestigio — See where your site is losing money",
		description:
			"Free 60-second diagnosis. Vestigio shows how much your site bleeds each month and what to fix first — in dollars, not colors.",
		ogAlt: "Vestigio — conversion audit that shows losses in dollars",
	},
	es: {
		title: "Vestigio — Dónde su sitio pierde dinero, en segundos",
		description:
			"Diagnóstico gratuito en 60 segundos. Vestigio muestra cuánto pierde su sitio cada mes y qué corregir primero — en dólares, no en colores.",
		ogAlt: "Vestigio — auditoría de conversión que muestra pérdidas en dólares",
	},
	de: {
		title: "Vestigio — Wo Ihre Website Geld verliert, in Sekunden",
		description:
			"Kostenlose 60-Sekunden-Diagnose. Vestigio zeigt, wie viel Ihre Website monatlich verliert und was zuerst zu beheben ist — in Euro, nicht in Farben.",
		ogAlt: "Vestigio — Conversion-Audit, das Verluste in Euro zeigt",
	},
};

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const meta = META_BY_LOCALE[locale] || META_BY_LOCALE.en;

	return {
		title: meta.title,
		description: meta.description,
		openGraph: {
			type: "website",
			title: meta.title,
			description: meta.description,
			images: [
				{
					url: "https://vestigio.io/images/logo/logo-light.png",
					width: 1200,
					height: 630,
					alt: meta.ogAlt,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: meta.title,
			description: meta.description,
			images: ["https://vestigio.io/images/logo/logo-light.png"],
		},
	};
}

export default function HomePage() {
	return (
		<main>
			{/* Preload the hero video poster as the LCP candidate on mobile.
			    The <video> element keeps preload="none" (no video bytes
			    fetched on cold load), but the poster is what fills the
			    16:9 hero box before play starts — so it IS the LCP image
			    for the first viewport. fetchPriority="high" + early head
			    hint pulls it ahead of below-the-fold images in the
			    browser's priority queue. */}
			<link
				rel="preload"
				as="image"
				href="/images/hero/vsl-poster.jpg"
				// @ts-expect-error — React's typing for fetchPriority is
				// still landing; the lowercase attribute is the standard.
				fetchpriority="high"
			/>
			<Home />
		</main>
	);
}
