// ──────────────────────────────────────────────
// Interstitial Frame Types
//
// Value-on-fill: between form steps, render quiet screens that give
// something back to the visitor (benchmark, anticipation preview,
// finding teaser) instead of jumping straight to the next question.
//
// Registry-driven so adding a new frame in 3 months is one entry in
// interstitial-registry.ts — no change to the form state machine.
// ──────────────────────────────────────────────

import type { LeadState } from "@/types/lp-audit";
import type { CrawlProgress } from "./crawl-progress";

export type ScreenIdLite =
	| "domain"
	| "business_type"
	| "service_category"
	| "app_platform"
	| "enterprise_segment"
	| "revenue"
	| "concern"
	| "current_method"
	| "why_now"
	| "email";

export type InterstitialVariant = "benchmark" | "anticipation" | "finding_teaser";

export interface BenchmarkInterstitialProps {
	variant: "benchmark";
	/** Headline echoing the visitor's just-given answer. */
	answer: string;
	/** "Pra calibrar, comparamos contra:" type intro. */
	headline: string;
	/** 2 anchors to display (metric / value / source). */
	anchors: Array<{ metric: string; value: string; source: string }>;
}

export interface AnticipationInterstitialProps {
	variant: "anticipation";
	/** Visitor's domain to ground the anticipation. */
	domain: string;
	/** Items the audit will contain — used to render the preview list. */
	items: Array<{ icon: "stats" | "money" | "root_cause" | "screenshot" | "plan"; label: string }>;
}

export interface FindingTeaserInterstitialProps {
	variant: "finding_teaser";
	finding: {
		title: string;
		category: string;
	};
	/** R$ range in CENTS — formatted by the frame to BRL units. */
	rangeLowBrlCents: number;
	rangeHighBrlCents: number;
}

export type InterstitialProps =
	| BenchmarkInterstitialProps
	| AnticipationInterstitialProps
	| FindingTeaserInterstitialProps;

export interface InterstitialDef {
	/** After which screen this fires (the screen the visitor just completed). */
	afterScreen: ScreenIdLite;
	variant: InterstitialVariant;
	/** Returns null = skip this interstitial (e.g. data not ready yet). */
	resolve: (
		form: LeadState,
		crawl: CrawlProgress | null,
	) => InterstitialProps | null;
	/**
	 * One-line ownership hint — required so the registry stays legible
	 * as it grows. Use present tense: "shows category benchmark...",
	 * "previews the audit report contents...".
	 */
	description: string;
}
