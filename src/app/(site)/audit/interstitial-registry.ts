// ──────────────────────────────────────────────
// Interstitial Registry — declarative table of value frames
//
// Single source of truth for "what shows up between which steps". Each
// entry binds to a screen the visitor just completed and returns the
// props for the frame, OR null to skip silently when the data isn't
// ready (e.g. teaserFinding still being computed).
//
// Adding a new value frame in the future:
//   1. Add a variant in src/types/interstitial.ts (if it's a new shape)
//   2. Build the component in components/form-steps/interstitials/
//   3. Add an entry here with afterScreen + resolve(form, crawl)
//   4. Wire it into page.tsx's interstitial switch
//
// Zero changes to useLpAuditForm state machine for new entries.
// ──────────────────────────────────────────────

import type { InterstitialDef, ScreenIdLite } from "@/types/interstitial";
import { pickAnchorsFor } from "@/lib/market-anchors";
import type { LeadState } from "./useLpAuditForm";

// Copy for the headline of the benchmark frame, per business model.
// Keeps the tone "calibrando contra X" — not "vocês são piores que X".
const BENCHMARK_HEADLINE_BY_BM: Record<string, string> = {
	ecommerce: "Comparando a sua loja com benchmarks reais de e-commerce",
	saas: "Comparando o seu funil com benchmarks de SaaS B2B",
	lead_gen: "Comparando a sua captação com benchmarks de lead-gen B2B",
	services: "Comparando a sua operação com benchmarks de serviços",
	app_conversion: "Comparando o seu funil com benchmarks de app conversion",
	enterprise: "Comparando a sua operação com benchmarks enterprise",
	hybrid: "Comparando o seu funil com benchmarks de mercado",
};

const BUSINESS_TYPE_LABEL: Record<string, string> = {
	ecommerce: "Loja online",
	saas: "SaaS / Software",
	lead_gen: "Captação de clientes",
	services: "Serviços",
	app_conversion: "App mobile",
	enterprise: "Enterprise / B2B",
	hybrid: "Misto",
};

// ──────────────────────────────────────────────
// Registry entries
// ──────────────────────────────────────────────

export const INTERSTITIAL_REGISTRY: InterstitialDef[] = [
	// 1. Benchmark after business_type (or sub-segment screen when present)
	//    Fires after the *last* business-classification screen so the visitor
	//    has a fully-resolved vertical when we show the anchors.
	{
		afterScreen: "business_type",
		variant: "benchmark",
		description:
			"shows 2 anchors from public benchmarks (Baymard, ProfitWell, etc.) calibrated to the just-picked businessModel — signals 'we understand your category'",
		resolve: (form: LeadState) => {
			// Skip when the visitor will go through a sub-segment screen
			// next — we'll show the benchmark after that one resolves
			// (handled by the next entry).
			if (
				form.businessModel === "services" ||
				form.businessModel === "app_conversion" ||
				form.businessModel === "enterprise"
			) {
				return null;
			}
			const anchors = pickAnchorsFor(form.businessModel, 2);
			if (anchors.length === 0) return null;
			return {
				variant: "benchmark",
				answer: BUSINESS_TYPE_LABEL[form.businessModel] ?? form.businessModel,
				headline: BENCHMARK_HEADLINE_BY_BM[form.businessModel] ?? "Comparando com benchmarks de mercado",
				anchors: anchors.map((a) => ({ metric: a.metric, value: a.value, source: a.source })),
			};
		},
	},

	// 2a. Benchmark after service_category (services-vertical sub-step)
	{
		afterScreen: "service_category",
		variant: "benchmark",
		description: "services-vertical benchmark frame — same shape as #1 but fires after the services sub-step",
		resolve: (form: LeadState) => {
			const anchors = pickAnchorsFor("services", 2);
			if (anchors.length === 0) return null;
			return {
				variant: "benchmark",
				answer: BUSINESS_TYPE_LABEL["services"],
				headline: BENCHMARK_HEADLINE_BY_BM["services"],
				anchors: anchors.map((a) => ({ metric: a.metric, value: a.value, source: a.source })),
			};
		},
	},

	// 2b. Benchmark after app_platform
	{
		afterScreen: "app_platform",
		variant: "benchmark",
		description: "app-conversion-vertical benchmark frame — fires after the platform sub-step",
		resolve: () => {
			const anchors = pickAnchorsFor("app_conversion", 2);
			if (anchors.length === 0) return null;
			return {
				variant: "benchmark",
				answer: BUSINESS_TYPE_LABEL["app_conversion"],
				headline: BENCHMARK_HEADLINE_BY_BM["app_conversion"],
				anchors: anchors.map((a) => ({ metric: a.metric, value: a.value, source: a.source })),
			};
		},
	},

	// 2c. Benchmark after enterprise_segment
	{
		afterScreen: "enterprise_segment",
		variant: "benchmark",
		description: "enterprise-vertical benchmark frame — fires after the segment sub-step",
		resolve: () => {
			const anchors = pickAnchorsFor("enterprise", 2);
			if (anchors.length === 0) return null;
			return {
				variant: "benchmark",
				answer: BUSINESS_TYPE_LABEL["enterprise"],
				headline: BENCHMARK_HEADLINE_BY_BM["enterprise"],
				anchors: anchors.map((a) => ({ metric: a.metric, value: a.value, source: a.source })),
			};
		},
	},

	// 3. Finding teaser after current_method (Sprint 3 — only fires if
	//    the early-crawl already produced a teaserFinding by now).
	{
		afterScreen: "current_method",
		variant: "finding_teaser",
		description: "shows 1 finding detected by the early-crawl while the visitor was answering — fires only when teaserFinding is ready",
		resolve: (_form, crawl) => {
			if (!crawl || crawl.status !== "ready" || !crawl.teaserFinding) return null;
			return {
				variant: "finding_teaser",
				finding: {
					title: crawl.teaserFinding.title,
					category: crawl.teaserFinding.category,
				},
				rangeLowBrlCents: crawl.teaserFinding.rangeLowBrlCents,
				rangeHighBrlCents: crawl.teaserFinding.rangeHighBrlCents,
			};
		},
	},

	// 4. Anticipation block after why_now (terminal step is email,
	//    so this is the last interstitial before they submit).
	{
		afterScreen: "why_now",
		variant: "anticipation",
		description: "previews the report contents (5 findings, R$ impact, root cause, screenshots, plan) — reduces email-submission hesitation",
		resolve: (form: LeadState) => {
			if (!form.domain) return null;
			return {
				variant: "anticipation",
				domain: form.domain,
				items: [
					{ icon: "stats", label: "5 vazamentos priorizados por R$ impactado" },
					{ icon: "money", label: "Quanto cada um vale por mês (com faixa)" },
					{ icon: "root_cause", label: "Causa raiz + como atacar" },
					{ icon: "screenshot", label: "Screenshot dos problemas detectados" },
					{ icon: "plan", label: "Plano de execução do mês" },
				],
			};
		},
	},
];

/**
 * Resolve the interstitial (if any) to show after the visitor completes
 * `completedScreen`. Returns null when no entry matches OR when the
 * matched entry's resolve() returned null (data not ready).
 */
export function resolveInterstitialFor(
	completedScreen: ScreenIdLite,
	form: LeadState,
	crawl: Parameters<InterstitialDef["resolve"]>[1],
) {
	for (const def of INTERSTITIAL_REGISTRY) {
		if (def.afterScreen !== completedScreen) continue;
		const props = def.resolve(form, crawl);
		if (props) return props;
	}
	return null;
}
