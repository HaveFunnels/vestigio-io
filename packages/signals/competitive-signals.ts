import {
	Evidence,
	EvidenceType,
	Signal,
	Scoping,
	SignalCategory,
	IdGenerator,
	makeRef,
} from "../domain";
import type {
	CompetitorPageSnapshotPayload,
	CopyElementsPayload,
} from "../domain";
import { createSignal } from "./create";

// ──────────────────────────────────────────────
// Competitive Lens signals — Wave 24
//
// Consumes CompetitorPageSnapshot evidence (one per competitor per
// cycle) and your own CopyElementsPayload / EmailAuthRecord +
// HTTP-header trust signals to emit competitive-comparison signals.
//
// Two rules in Wave 24:
//   1. competitive.copy_mirror_detected
//      — One or more competitors share enough hero copy / heading
//        phrases / CTA wording with you that diferenciação está
//        diluída. Shingled phrase comparison, threshold-based.
//
//   2. competitive.trust_posture_lag
//      — Your trust posture score (composite of HTTPS, security
//        headers, DMARC, SPF) is meaningfully below the median of
//        your peer set. The signal carries the delta + peer count.
//
// Field convention (Signal has no free-form `data`, so we pack
// things into the standard slots):
//   - subject_label = the most-mirrored competitor domain, or
//                     "peer set" for aggregate rules
//   - value         = primary discriminator (mirror count, lag bucket)
//   - numeric_value = numeric magnitude (matches found, score delta)
//   - description   = compact summary (e.g. "3 frases compartilhadas
//                     com funnelsmasters.com.br, copy.com.br …")
// ──────────────────────────────────────────────

const MIRROR_PHRASE_MIN_WORDS = 4;
const MIRROR_PHRASE_TOP_K = 12;
const MIRROR_THRESHOLD_MATCHES = 3;
const TRUST_LAG_DELTA_THRESHOLD = 15; // points (0-100 scale)

// Commodity 4-grams that appear across the entire B2B SaaS / e-com
// category. Matching one of these is NOT a positioning collision —
// it's just shared market vocabulary. Subtracted from the match set
// before threshold check so the signal stays specific. Curated; add
// new entries when we see a false positive in production.
const COMMODITY_PHRASES: ReadonlySet<string> = new Set([
	"sem cartao de credito",
	"teste gratis por dias",
	"experimente gratis por dias",
	"todos os direitos reservados",
	"politica de privacidade",
	"termos de uso",
	"cadastre se gratis",
	"fale com nosso time",
	"agende uma demo",
	"comece gratis agora",
	"comece hoje mesmo",
	"sign up for free",
	"start free trial today",
	"no credit card required",
	"book a demo today",
	"contact our sales team",
	"all rights reserved",
	"terms of service",
	"privacy policy",
]);

// ── Normalization + shingling helpers ──
function normalizeText(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function words(s: string): string[] {
	const norm = normalizeText(s);
	if (!norm) return [];
	return norm.split(" ").filter((w) => w.length > 1);
}

function shingles(text: string, n: number): Set<string> {
	const out = new Set<string>();
	const tokens = words(text);
	if (tokens.length < n) return out;
	for (let i = 0; i <= tokens.length - n; i++) {
		out.add(tokens.slice(i, i + n).join(" "));
	}
	return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

function commonPhrases(a: Set<string>, b: Set<string>, k: number): string[] {
	const out: string[] = [];
	for (const x of a) {
		if (b.has(x) && !COMMODITY_PHRASES.has(x)) {
			out.push(x);
			if (out.length >= k) break;
		}
	}
	return out;
}

// Collect the phrases that represent "your copy" — taken from
// CopyElementsPayload above_fold_text, h1, subheadline, primary CTA.
// Falls back to PageContentPayload body_text_snippet if CopyElements
// isn't present (older cycles or shallow modes).
function buildOwnCopyPhrases(
	byType: Map<EvidenceType, Evidence[]>,
): Set<string> {
	const out = new Set<string>();
	const copyElements = byType.get(EvidenceType.CopyElements) || [];
	for (const ev of copyElements) {
		const p = ev.payload as CopyElementsPayload;
		if (p.h1) addShingles(out, p.h1, MIRROR_PHRASE_MIN_WORDS);
		if (p.subheadline) addShingles(out, p.subheadline, MIRROR_PHRASE_MIN_WORDS);
		if (p.primary_cta) addShingles(out, p.primary_cta, 3); // CTAs are short
		if (p.above_fold_text)
			addShingles(out, p.above_fold_text, MIRROR_PHRASE_MIN_WORDS);
		for (const cta of p.cta_texts) addShingles(out, cta, 3);
	}
	if (out.size === 0) {
		// Fallback: PageContent body snippet from the homepage.
		const pageContents = byType.get(EvidenceType.PageContent) || [];
		for (const ev of pageContents.slice(0, 3)) {
			const p = ev.payload as { body_text_snippet: string | null };
			if (p.body_text_snippet)
				addShingles(out, p.body_text_snippet, MIRROR_PHRASE_MIN_WORDS);
		}
	}
	return out;
}

function addShingles(target: Set<string>, text: string, n: number): void {
	for (const s of shingles(text, n)) target.add(s);
}

function buildCompetitorPhrases(payload: CompetitorPageSnapshotPayload): Set<string> {
	const out = new Set<string>();
	if (payload.h1) addShingles(out, payload.h1, MIRROR_PHRASE_MIN_WORDS);
	if (payload.title) addShingles(out, payload.title, MIRROR_PHRASE_MIN_WORDS);
	if (payload.meta_description)
		addShingles(out, payload.meta_description, MIRROR_PHRASE_MIN_WORDS);
	if (payload.hero_text)
		addShingles(out, payload.hero_text, MIRROR_PHRASE_MIN_WORDS);
	if (payload.body_text_snippet)
		addShingles(out, payload.body_text_snippet, MIRROR_PHRASE_MIN_WORDS);
	for (const h of payload.headings)
		addShingles(out, h.text, MIRROR_PHRASE_MIN_WORDS);
	for (const cta of payload.cta_texts) addShingles(out, cta, 3);
	return out;
}

// ── Trust posture aggregation ──
// Maps DMARC policy strength to a 0-100 sub-score.
function dmarcPolicyScore(
	present: boolean,
	policy: "none" | "quarantine" | "reject" | null,
): number {
	if (!present) return 0;
	switch (policy) {
		case "reject":
			return 100;
		case "quarantine":
			return 60;
		case "none":
			return 30;
		default:
			return 20; // present but unparseable
	}
}

// Build YOUR trust posture composite score from the trust signals
// already emitted by other extractors. We re-read the signals rather
// than the underlying evidence so we honor the same thresholds the
// rest of the engine uses (HSTS missing, CSP weak, DMARC policy, …).
//
// Composite is the average of 4 sub-scores, each on 0-100:
//   - headers: security_headers_score (or derived from HSTS/CSP flags)
//   - DMARC: from dmarc_absent / dmarc_policy_weak signals
//   - SPF: from spf_absent signal
//   - HTTPS+HSTS: from hsts_missing signal (HTTPS itself is table-stakes)
//
// When a sub-score signal is missing it defaults to 50 (unknown), not
// 0 — we don't want to penalize for instruments we didn't run.
function computeOwnTrustScore(byKey: Map<string, Signal>): number {
	const scoreSig = byKey.get("security_headers_score");
	let headersScore = 50;
	if (scoreSig && scoreSig.numeric_value !== null) {
		headersScore = scoreSig.numeric_value;
	} else {
		// Without an explicit score, infer from absence signals.
		const hstsMissing = byKey.has("hsts_missing");
		const cspMissing = byKey.has("csp_missing_or_weak");
		headersScore = hstsMissing && cspMissing ? 20 : hstsMissing || cspMissing ? 50 : 80;
	}

	let dmarcScore = 70;
	if (byKey.has("email.dmarc_absent")) {
		dmarcScore = 0;
	} else if (byKey.has("email.dmarc_policy_weak")) {
		const sig = byKey.get("email.dmarc_policy_weak")!;
		dmarcScore = sig.value === "quarantine" ? 60 : 30;
	} else {
		// No absence/weak signal means DMARC is reject — strong.
		dmarcScore = 100;
	}

	let spfScore = 70;
	if (byKey.has("email.spf_absent")) spfScore = 0;
	else if (byKey.has("email.spf_includes_too_broad")) spfScore = 50;
	else spfScore = 100;

	// HSTS sub-score (HTTPS itself we assume — Vestigio refuses to
	// audit non-HTTPS sites in current flows).
	const hstsScore = byKey.has("hsts_missing") ? 30 : 100;

	const composite = Math.round(
		(headersScore + dmarcScore + spfScore + hstsScore) / 4,
	);
	return Math.max(0, Math.min(100, composite));
}

function computeCompetitorTrustScore(
	payload: CompetitorPageSnapshotPayload,
): number {
	if (payload.fetch_failed) return -1; // sentinel: exclude from median
	const t = payload.trust_snapshot;
	const headersScore = t.headers_score;
	const dmarcScore = dmarcPolicyScore(t.dmarc_present, t.dmarc_policy);
	const spfScore = t.spf_present ? 100 : 0;
	const hstsScore = t.hsts_present ? 100 : 30;
	return Math.round((headersScore + dmarcScore + spfScore + hstsScore) / 4);
}

function median(arr: number[]): number {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
		: sorted[mid];
}

export function extractCompetitiveSignals(
	byType: Map<EvidenceType, Evidence[]>,
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	signals: Signal[],
	ids: IdGenerator,
): void {
	const snapshots = byType.get(EvidenceType.CompetitorPageSnapshot) || [];
	if (snapshots.length === 0) return;

	const ownPhrases = buildOwnCopyPhrases(byType);
	const ownTrustScore = computeOwnTrustScore(byKey);

	// ── Copy mirror detection ──
	const mirrorMatches: Array<{
		domain: string;
		matches: number;
		jaccard: number;
		examples: string[];
		evidenceRef: string;
	}> = [];
	for (const ev of snapshots) {
		const payload = ev.payload as CompetitorPageSnapshotPayload;
		if (payload.fetch_failed) continue;
		const competitorPhrases = buildCompetitorPhrases(payload);
		if (competitorPhrases.size === 0) continue;
		const matches = commonPhrases(ownPhrases, competitorPhrases, MIRROR_PHRASE_TOP_K);
		if (matches.length >= MIRROR_THRESHOLD_MATCHES) {
			mirrorMatches.push({
				domain: payload.competitor_domain,
				matches: matches.length,
				jaccard: Math.round(jaccard(ownPhrases, competitorPhrases) * 100),
				examples: matches.slice(0, 3),
				evidenceRef: makeRef("evidence", ev.id),
			});
		}
	}

	if (mirrorMatches.length > 0) {
		mirrorMatches.sort((a, b) => b.matches - a.matches);
		const top = mirrorMatches[0];
		const totalMatches = mirrorMatches.reduce((sum, m) => sum + m.matches, 0);
		const description = mirrorMatches
			.slice(0, 3)
			.map((m) => `${m.domain}: ${m.matches} frases (${m.examples.join(" / ")})`)
			.join(" | ");
		signals.push({
			...createSignal({
				signal_key: "competitive.copy_mirror_detected",
				attribute: "competitive.copy_mirror.count",
				value: String(mirrorMatches.length),
				numeric_value: totalMatches,
				category: SignalCategory.Competitive,
				confidence: 85,
				scoping,
				cycle_ref,
				ids,
				evidence_refs: mirrorMatches.map((m) => m.evidenceRef),
				description: description.slice(0, 480),
			}),
			subject_label: top.domain,
		});
	}

	// ── Trust posture lag ──
	const peerScores = snapshots
		.map((ev) => computeCompetitorTrustScore(ev.payload as CompetitorPageSnapshotPayload))
		.filter((s) => s >= 0);
	if (peerScores.length >= 2) {
		const peerMedian = median(peerScores);
		const delta = peerMedian - ownTrustScore;
		if (delta >= TRUST_LAG_DELTA_THRESHOLD) {
			const lagBucket =
				delta >= 30 ? "severo" : delta >= 20 ? "moderado" : "leve";
			signals.push({
				...createSignal({
					signal_key: "competitive.trust_posture_lag",
					attribute: "competitive.trust.delta",
					value: lagBucket,
					numeric_value: delta,
					category: SignalCategory.Competitive,
					confidence: 80,
					scoping,
					cycle_ref,
					ids,
					evidence_refs: snapshots
						.filter(
							(ev) =>
								!(ev.payload as CompetitorPageSnapshotPayload).fetch_failed,
						)
						.map((ev) => makeRef("evidence", ev.id)),
					description: `Você: ${ownTrustScore}/100 — mediana de ${peerScores.length} concorrentes: ${peerMedian}/100 (delta ${delta})`,
				}),
				subject_label: "peer set",
			});
		}
	}
}

export const __testing = {
	normalizeText,
	shingles,
	jaccard,
	commonPhrases,
	dmarcPolicyScore,
	computeOwnTrustScore,
	computeCompetitorTrustScore,
	median,
};
