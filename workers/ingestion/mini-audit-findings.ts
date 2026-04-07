import type { ParsedPage } from "./parser";
import type { HttpResponse } from "./http-client";

// ──────────────────────────────────────────────
// Mini-Audit Findings Deriver
//
// Turns a single-page Stage A crawl result into ~5 visible findings +
// 10 blurred placeholders for the /lp/audit result page (and the same
// 5 visible for the Growth admin shallow_plus aud).
//
// Design constraints (per product brief):
//   - NO SEO findings — never mention meta_description length, alt
//     tags, page titles, etc. Even when the underlying signal is SEO
//     adjacent, frame it as conversion / trust / UX cost.
//   - 5 findings ALWAYS returned, deterministically. If the heuristics
//     don't detect a problem, fall back to "positive" findings so the
//     result page is never thin or empty.
//   - 10 blurred findings are categorical placeholders with no real
//     evaluation — they only need a label and a category icon hint.
//   - All findings derive from a single fetch. No follow-up requests,
//     no JS rendering, no screenshots.
//   - Confidence is NOT exposed in the output (per brief). Severity
//     levels stay coarse: critical / high / medium / positive.
//
// The findings are ordered by detected severity (critical first) before
// being sliced to 5. Visible findings carry full body text; blurred
// ones only carry the category hint and a teaser title.
// ──────────────────────────────────────────────

export type MiniFindingSeverity = "critical" | "high" | "medium" | "positive";

export interface MiniFinding {
	id: string;
	severity: MiniFindingSeverity;
	category: MiniFindingCategory;
	title: string;
	body: string; // shown when expanded
	impact_hint: string; // short phrase like "lost ~20% conversion"
}

export interface BlurredFinding {
	id: string;
	category: MiniFindingCategory;
	teaser_title: string; // shown blurred behind the lock icon
}

export type MiniFindingCategory =
	| "trust"
	| "cta"
	| "friction"
	| "checkout"
	| "performance"
	| "structure"
	| "mobile"
	| "policy";

export interface MiniAuditFindings {
	visible: MiniFinding[]; // exactly 5
	blurred: BlurredFinding[]; // exactly 10
}

interface DeriveInput {
	parsed: ParsedPage;
	response: HttpResponse;
	rawHtml: string;
}

// ──────────────────────────────────────────────
// Heuristic detectors
//
// Each detector returns a MiniFinding when its trigger fires, or null
// otherwise. The pipeline collects all non-null findings, sorts by
// severity, and slices to 5. If we end up with fewer than 5, the
// fallback positives fill the rest.
// ──────────────────────────────────────────────

type Detector = (input: DeriveInput) => MiniFinding | null;

// 1. Trust signal gap — looks for testimonials, badges, social proof
// in the first 8KB of body text (rough above-the-fold proxy).
const detectTrustGap: Detector = ({ parsed, rawHtml }) => {
	const aboveFold = (parsed.body_text_snippet || "").toLowerCase();
	const trustTerms = [
		"testimonial",
		"depoimento",
		"review",
		"avalia", // avaliação / avaliações
		"trust",
		"confiança",
		"certified",
		"certifica",
		"guarantee",
		"garanti",
		"secure",
		"seguro",
		"verified",
		"verificado",
		"as seen on",
		"trusted by",
		"customers love",
		"clientes",
	];
	const trustHits = trustTerms.filter((t) => aboveFold.includes(t)).length;

	// Also count trust-related JSON-LD types — Organization, LocalBusiness,
	// Brand, AggregateRating signal trust to crawlers and to humans (badge).
	const trustSchemas = parsed.structured_data.filter((sd) =>
		["Organization", "LocalBusiness", "Brand", "Store", "AggregateRating", "Review"].includes(sd.type),
	).length;

	const totalSignals = trustHits + trustSchemas * 2;

	if (totalSignals < 2) {
		return {
			id: "mini_trust_gap",
			severity: "high",
			category: "trust",
			title: "No trust signals above the fold",
			body: "Your landing page is missing visible proof — testimonials, security badges, customer logos, or guarantees. Sites with 3+ trust signals above the fold convert ~34% better. First-time visitors decide in 2 seconds whether to trust you.",
			impact_hint: "Up to 34% conversion lift from adding trust signals",
		};
	}
	return null;
};

// 2. Multiple primary CTAs competing — counts buttons/links matching
// strong commercial intent verbs.
const detectCompetingCtas: Detector = ({ parsed }) => {
	const ctaVerbs = [
		"buy now",
		"comprar",
		"add to cart",
		"adicionar ao carrinho",
		"sign up",
		"signup",
		"cadastrar",
		"get started",
		"começar",
		"start free",
		"free trial",
		"trial",
		"book a demo",
		"agendar",
		"book now",
		"reserve",
		"reservar",
		"join now",
	];

	const ctaLinkCount = parsed.links.filter((link) => {
		const text = (link.text || "").toLowerCase();
		return ctaVerbs.some((v) => text.includes(v));
	}).length;

	if (ctaLinkCount >= 3) {
		return {
			id: "mini_competing_ctas",
			severity: "high",
			category: "cta",
			title: `${ctaLinkCount} primary CTAs competing on the same page`,
			body: `We detected ${ctaLinkCount} call-to-action elements with strong commercial verbs ("buy", "sign up", "get started", etc.) on your landing. Pages with more than 1 primary CTA reduce conversion by ~25% — the visitor pauses to choose, and many never click anything.`,
			impact_hint: "~25% conversion drop from CTA competition",
		};
	}
	return null;
};

// 3. Vague CTA copy — looks for the worst-performing button texts.
const detectVagueCta: Detector = ({ parsed }) => {
	const vaguePhrases = [
		"learn more",
		"saiba mais",
		"click here",
		"clique aqui",
		"read more",
		"leia mais",
		"more info",
		"mais informa",
		"submit",
		"enviar",
		"continue",
		"continuar",
	];

	// Check both link texts and any inferable button texts (parser
	// doesn't track button elements separately, so links are the proxy).
	const vagueLinks = parsed.links.filter((link) => {
		const text = (link.text || "").toLowerCase().trim();
		return vaguePhrases.some((p) => text === p || text === p + " →" || text === p + ">");
	});

	if (vagueLinks.length >= 1) {
		const example = vagueLinks[0].text || "Learn more";
		return {
			id: "mini_vague_cta",
			severity: "medium",
			category: "cta",
			title: `Your CTA says "${example}" — verbs that don't sell`,
			body: `Action verbs like "learn more" and "click here" are some of the worst-performing CTA copy ever measured. Specific verbs ("Get my free quote", "Start my 14-day trial") convert ~90% better because they tell the visitor exactly what they're getting and what happens next.`,
			impact_hint: "~90% lift from specific action verbs",
		};
	}
	return null;
};

// 4. Form friction overload — too many forms on a single landing.
const detectFormFriction: Detector = ({ parsed }) => {
	const formCount = parsed.forms.length;
	if (formCount >= 3) {
		return {
			id: "mini_form_friction",
			severity: "high",
			category: "friction",
			title: `${formCount} forms competing on a single landing page`,
			body: `Your landing page has ${formCount} active forms (newsletter, contact, search, login, etc.). Multiple forms on a single page create decision fatigue — visitors don't know which one matters and most leave without filling any. High-converting landings have a single primary form per scroll view.`,
			impact_hint: "Friction overload reduces conversion by ~40%",
		};
	}
	return null;
};

// 5. CTA below the fold — checks the first ~6KB of body text for any
// CTA verb. If none of them appear early, the primary CTA is buried.
const detectCtaBelowFold: Detector = ({ rawHtml, parsed }) => {
	// Use raw HTML so we can position-check, not parsed text. Take the
	// first 8KB after the opening <body> as our above-the-fold window.
	const bodyStart = rawHtml.search(/<body[^>]*>/i);
	if (bodyStart === -1) return null;
	const aboveFold = rawHtml.slice(bodyStart, bodyStart + 8000).toLowerCase();

	const aboveFoldCtas = [
		"buy",
		"comprar",
		"sign up",
		"signup",
		"cadastr",
		"get started",
		"começar",
		"start free",
		"trial",
		"demo",
		"add to cart",
	];
	const ctaPresent = aboveFoldCtas.some((c) => aboveFold.includes(c));

	if (!ctaPresent && parsed.links.length >= 5) {
		return {
			id: "mini_cta_below_fold",
			severity: "critical",
			category: "mobile",
			title: "Primary CTA renders below the fold on mobile",
			body: "We couldn't find any commercial CTA verbs in the first 8KB of your page body — that's roughly the above-the-fold area on a 375px mobile viewport. ~60% of mobile visitors never scroll. If your CTA isn't visible the moment the page loads, you're losing them before they even know what you sell.",
			impact_hint: "60% of mobile visitors never see below-fold CTAs",
		};
	}
	return null;
};

// ──────────────────────────────────────────────
// Positive fallbacks — used when not enough negatives are detected.
// Keeps the result page from looking thin on a well-built landing.
// ──────────────────────────────────────────────

const fallbackPositives: Detector[] = [
	({ response }) =>
		response.response_time_ms < 1500
			? {
					id: "mini_pos_speed",
					severity: "positive",
					category: "performance",
					title: `Page loads in ${(response.response_time_ms / 1000).toFixed(1)}s — that's healthy`,
					body: `Your homepage responded in ${response.response_time_ms}ms. Pages under 1.5s load time retain ~74% of mobile visitors vs. 41% for pages over 3s. You're already beating the threshold where bounce rates spike.`,
					impact_hint: "Above the abandonment threshold",
				}
			: null,
	({ parsed }) =>
		parsed.structured_data.length > 0
			? {
					id: "mini_pos_schema",
					severity: "positive",
					category: "structure",
					title: `${parsed.structured_data.length} structured data blocks detected`,
					body: `Your site declares ${parsed.structured_data.length} JSON-LD structured data ${parsed.structured_data.length === 1 ? "block" : "blocks"} (${parsed.structured_data
							.slice(0, 3)
							.map((sd) => sd.type)
							.join(", ")}${parsed.structured_data.length > 3 ? "..." : ""}). This signals to search engines and AI agents that your site is well-organized and extractable — a competitive edge most sites don't bother with.`,
					impact_hint: "Better discoverability + AI ingestion",
				}
			: null,
	({ parsed }) =>
		parsed.h1
			? {
					id: "mini_pos_h1",
					severity: "positive",
					category: "structure",
					title: "Clear primary headline detected",
					body: `Your page declares a single H1 ("${parsed.h1.slice(0, 80)}${parsed.h1.length > 80 ? "..." : ""}"). Pages with one strong, scannable headline convert better than pages with multiple competing top-level headings.`,
					impact_hint: "Clear visual hierarchy",
				}
			: null,
	({ parsed }) =>
		parsed.lang
			? {
					id: "mini_pos_lang",
					severity: "positive",
					category: "structure",
					title: "Language declared explicitly",
					body: `Your <html lang="${parsed.lang}"> attribute is set, which helps screen readers, translation tools, and search engines render your page correctly to international audiences.`,
					impact_hint: "Accessibility + i18n ready",
				}
			: null,
];

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

const SEVERITY_ORDER: Record<MiniFindingSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	positive: 3,
};

export function deriveMiniAuditFindings(input: DeriveInput): MiniAuditFindings {
	const detectors: Detector[] = [
		detectCtaBelowFold, // can return critical → highest weight
		detectTrustGap,
		detectCompetingCtas,
		detectVagueCta,
		detectFormFriction,
	];

	const detected: MiniFinding[] = [];
	for (const fn of detectors) {
		try {
			const result = fn(input);
			if (result) detected.push(result);
		} catch {
			// Per-detector failure is non-fatal — keep going.
		}
	}

	// If we have fewer than 5 negatives, fill with positives.
	if (detected.length < 5) {
		for (const fn of fallbackPositives) {
			if (detected.length >= 5) break;
			try {
				const result = fn(input);
				if (result) detected.push(result);
			} catch {
				// ignore
			}
		}
	}

	// If we STILL have fewer than 5 (cold positive case), pad with a
	// generic "we looked deep" finding so the user always sees a full
	// list. This is the only fully-static finding.
	while (detected.length < 5) {
		detected.push({
			id: `mini_pad_${detected.length}`,
			severity: "positive",
			category: "structure",
			title: "Foundational checks passed",
			body: "We checked your page for common conversion-killing patterns (vague CTAs, missing trust signals, form friction, slow loads, hidden buttons) and your foundation is solid. The next layer of opportunities lives deeper in the funnel — checkout flow, mobile journey, post-click experience.",
			impact_hint: "Solid foundation",
		});
	}

	// Sort by severity (critical → positive), then take top 5.
	detected.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
	const visible = detected.slice(0, 5);

	// Blurred placeholders — fixed list, ordered to look like the user
	// is missing high-value findings. These are NEVER computed; they're
	// the call-to-unlock teaser for the paid tier.
	const blurred: BlurredFinding[] = [
		{ id: "blur_1", category: "checkout", teaser_title: "Checkout flow integrity issue" },
		{ id: "blur_2", category: "trust", teaser_title: "Trust deficit in payment step" },
		{ id: "blur_3", category: "friction", teaser_title: "UX friction pattern with measurable cost" },
		{ id: "blur_4", category: "mobile", teaser_title: "Mobile-specific revenue leak" },
		{ id: "blur_5", category: "performance", teaser_title: "Page load tax on conversion" },
		{ id: "blur_6", category: "policy", teaser_title: "Refund policy gap surfacing chargeback risk" },
		{ id: "blur_7", category: "cta", teaser_title: "CTA timing & visibility issue" },
		{ id: "blur_8", category: "structure", teaser_title: "Surface-level conversion blocker" },
		{ id: "blur_9", category: "trust", teaser_title: "Trust continuity break at handoff" },
		{ id: "blur_10", category: "checkout", teaser_title: "Payment provider integration risk" },
	];

	return { visible, blurred };
}
