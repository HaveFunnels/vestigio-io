// ──────────────────────────────────────────────
// Peer-prevalence LINE — customer-facing sentence.
//
// Sits on top of peer-prevalence.ts (which gates whether a finding
// SHOULD fire based on cohort prevalence). This module answers a
// different question: given a finding that DID fire, how does the
// customer's absence of the pattern compare to their peer cohort?
//
// The output is a single sentence appended below the root_cause
// inside the PlanSideDrawer FindingCard. Loss-frame + mimetic-
// desire lever: "X% of your peers do this. You don't."
//
// Data source: same static cohort files under
// src/data/vestigio-index/cohorts/ (18-25 BR sites × 3 verticals).
// Nothing computed live; nothing hits the DB.
//
// Cohort keying — the customer's env carries BusinessProfile.
// businessModel (7-bucket enum). The cohort registry keys on the
// Vestigio Index vertical string (ecommerce | saas-b2b |
// infoprodutos). Map handled here.
// ──────────────────────────────────────────────

import { getPeerPrevalence } from "./peer-prevalence";
import type { CohortAggregate } from "../../src/data/vestigio-index/cohort-types";
import { getPeerCohort } from "./peer-prevalence";

/** Maps BusinessProfile.businessModel → Vestigio Index cohort vertical.
 *  Only the buckets we have real cohort data for return a vertical.
 *  Everything else returns null → no peer line renders. */
export function businessModelToCohortVertical(
	businessModel: string | null | undefined,
): string | null {
	switch (businessModel) {
		case "ecommerce":
			return "ecommerce";
		case "saas":
			return "saas-b2b";
		case "infoproduct":
		case "info_product":
		case "infoprodutos":
			return "infoprodutos";
		// lead_gen / services / app_conversion / enterprise / hybrid have
		// no dedicated cohort yet. Returning null degrades safely (line
		// simply doesn't render).
		default:
			return null;
	}
}

/** Direction of the peer contrast: */
export type PeerDirection =
	| "peer_has" // most peers do X, customer doesn't → mimetic pressure
	| "peer_lacks"; // few peers do X, customer's absence isn't a finding

interface PeerLineRule {
	/** Which pattern in the cohort's `prevalence` map is compared. */
	patternKey: string;
	/** Verticals this inference_key is meaningful for. */
	verticals: string[];
	/** Threshold below which the line reads as noise ("only 5% do X, so
	 *  your absence tells nobody anything"). */
	minPrevalenceToShow: number;
}

/** Inference-key → peer-line rule. Curated whitelist — expand as new
 *  cohorts land or as the engine emits new patterns worth benchmarking.
 *  See dictionary/pt-BR.json engine.inference_titles for the full
 *  inference-key catalog. */
const PEER_LINE_RULES: Record<string, PeerLineRule> = {
	// Ecommerce ─────
	payment_options_invisible: {
		patternKey: "pixMention",
		verticals: ["ecommerce", "saas-b2b"],
		minPrevalenceToShow: 0.30,
	},
	whatsapp_channel_disconnected: {
		patternKey: "whatsappContact",
		verticals: ["ecommerce"],
		minPrevalenceToShow: 0.30,
	},
	// SaaS-B2B ─────
	no_free_trial_offered: {
		patternKey: "freeTrialOffered",
		verticals: ["saas-b2b"],
		minPrevalenceToShow: 0.30,
	},
	pricing_page_framing_unclear: {
		patternKey: "pricingPageLink",
		verticals: ["saas-b2b"],
		minPrevalenceToShow: 0.40,
	},
	trust_signal_gap: {
		patternKey: "customerLogos",
		verticals: ["saas-b2b"],
		minPrevalenceToShow: 0.30,
	},
};

export interface PeerLine {
	/** 0..1 prevalence in the peer cohort. */
	prevalence: number;
	/** Cohort's real sample size (urlsSucceeded). Displayed as
	 *  "de N sites analisados" so the number carries credibility. */
	cohortSampleSize: number;
	/** ISO period the cohort was scanned (e.g. "2026-06"). Displayed
	 *  as "análise de {period}" for freshness signal. */
	cohortPeriod: string;
	/** Which vertical the peer cohort represents — surfaces in the
	 *  copy ("dos e-commerces BR", "dos SaaS B2B"). */
	vertical: string;
	/** Human label for the pattern being compared, in the customer's
	 *  locale. E.g. "Pix acima da dobra", "trial gratuito visível". */
	patternLabel: string;
	direction: PeerDirection;
}

/** Vertical + locale-scoped pattern labels, ready for copy. Kept here
 *  instead of the dictionary so peer-line evolution doesn't require a
 *  translation round-trip when a new pattern is added. */
const PATTERN_LABELS: Record<string, Partial<Record<string, string>>> = {
	pixMention: {
		"pt-BR": "Pix visível acima da dobra",
		en: "Pix visible above the fold",
		es: "Pix visible sobre la primera vista",
		de: "Pix sichtbar über der Falz",
	},
	whatsappContact: {
		"pt-BR": "WhatsApp como canal visível de contato",
		en: "WhatsApp as a visible contact channel",
		es: "WhatsApp como canal visible de contacto",
		de: "WhatsApp als sichtbarer Kontaktkanal",
	},
	freeTrialOffered: {
		"pt-BR": "trial gratuito visível na home",
		en: "free trial visible on the home page",
		es: "prueba gratuita visible en la home",
		de: "sichtbare kostenlose Testversion auf der Startseite",
	},
	pricingPageLink: {
		"pt-BR": "página de preço linkada no menu",
		en: "pricing page linked in the nav",
		es: "página de precios enlazada en el menú",
		de: "Preisseite in der Navigation verlinkt",
	},
	customerLogos: {
		"pt-BR": "logos de clientes acima da dobra",
		en: "customer logos above the fold",
		es: "logos de clientes sobre la primera vista",
		de: "Kundenlogos über der Falz",
	},
};

/** Resolves a peer line for a given inference key + org context.
 *  Returns null when:
 *    - inference_key isn't whitelisted;
 *    - customer's businessModel doesn't map to any cohort;
 *    - inference_key isn't meaningful for the customer's vertical;
 *    - no cohort data for (vertical, locale);
 *    - cohort prevalence is below the rule's threshold. */
export function getPeerLine(
	inferenceKey: string,
	businessModel: string | null | undefined,
	locale: string | null | undefined,
): PeerLine | null {
	const rule = PEER_LINE_RULES[inferenceKey];
	if (!rule) return null;
	const vertical = businessModelToCohortVertical(businessModel);
	if (!vertical) return null;
	if (!rule.verticals.includes(vertical)) return null;
	const prevalence = getPeerPrevalence(vertical, locale, rule.patternKey as any);
	if (prevalence === null || prevalence < rule.minPrevalenceToShow) return null;
	const cohort: CohortAggregate | null = getPeerCohort(vertical, locale);
	if (!cohort) return null;
	const label = PATTERN_LABELS[rule.patternKey]?.[String(locale)] ?? rule.patternKey;
	return {
		prevalence,
		cohortSampleSize: cohort.urlsSucceeded,
		cohortPeriod: cohort.period,
		vertical,
		patternLabel: label,
		direction: "peer_has",
	};
}
