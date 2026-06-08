// ──────────────────────────────────────────────
// Wave 25 — competitive_lens SERP rules tests
//
// Golden fixtures for SerpResultsPayload — brand_serp_encroachment
// and serp_overlap_detected rules, plus exclusion logic.
// ──────────────────────────────────────────────

import {
	EvidenceType,
	IdGenerator,
	type Evidence,
	type Signal,
	type Scoping,
	type SerpResultsPayload,
	type PageContentPayload,
} from "../packages/domain";
import {
	extractCompetitiveSignals,
	__testing as sigInternals,
} from "../packages/signals/competitive-signals";
import { computeCompetitiveLensPack } from "../packages/inference/packs/competitive-lens";
import { testScoping, testEvidence } from "./helpers";
import {
	test,
	assert,
	assertEqual,
	resetCounters,
	getResults,
	printResults,
} from "./helpers";

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void): void {
	resetCounters();
	fn();
	const r = getResults();
	printResults(name);
	if (r.failed > 0) suitesFailed++;
	else suitesPassed++;
}

function makeSerpEvidence(
	query: string,
	intent: "brand" | "category" | "competitor",
	results: Array<{ rank: number; host: string; url?: string; title?: string }>,
): Evidence {
	const payload: SerpResultsPayload = {
		type: "serp_results",
		provider: "tavily",
		query,
		locale: "pt-BR",
		query_intent: intent,
		is_navigational: intent === "brand",
		results: results.map((r) => ({
			rank: r.rank,
			url: r.url || `https://${r.host}/`,
			host: r.host,
			title: r.title || `${r.host} - ${query}`,
			snippet: "",
			is_paid: false,
		})),
		related: [],
		total_results: results.length,
		fetched_at: new Date().toISOString(),
		from_cache: false,
	};
	return testEvidence(EvidenceType.SerpResults, payload);
}

function pageContentEvidenceWithUrl(url: string): Evidence {
	return testEvidence(EvidenceType.PageContent, {
		type: "page_content",
		url,
		title: "Test",
		meta_description: null,
		h1: null,
		canonical_url: null,
		lang: "pt-BR",
		has_forms: false,
		form_count: 0,
		script_count: 0,
		external_script_count: 0,
		internal_link_count: 0,
		external_link_count: 0,
		body_word_count: 0,
		body_text_snippet: null,
		headings: [],
	} as PageContentPayload);
}

function runPipeline(serpEvidence: Evidence[], ownPage?: Evidence): {
	signals: Signal[];
	inferences: ReturnType<typeof computeCompetitiveLensPack>;
} {
	const scoping: Scoping = testScoping();
	const cycle_ref = "audit_cycle:test";
	const ids = new IdGenerator(cycle_ref + ":serp_test");

	const byType = new Map<EvidenceType, Evidence[]>();
	byType.set(EvidenceType.SerpResults, serpEvidence);
	if (ownPage) byType.set(EvidenceType.PageContent, [ownPage]);

	const signals: Signal[] = [];
	const byKey = new Map<string, Signal>();
	extractCompetitiveSignals(byType, byKey, scoping, cycle_ref, signals, ids);

	const byKeyFinal = new Map<string, Signal>();
	for (const s of signals) byKeyFinal.set(s.signal_key, s);
	const inferences = computeCompetitiveLensPack({
		signals,
		byAttribute: new Map(),
		byKey: byKeyFinal,
		first: () => undefined,
		scoping,
		cycle_ref,
		ids,
	});
	return { signals, inferences };
}

function hasInf(inferences: any[], key: string): boolean {
	return inferences.some((i) => i.inference_key === key);
}

function infByKey(inferences: any[], key: string) {
	return inferences.find((i) => i.inference_key === key);
}

// ══════════════════════════════════════════════════
// Suite 1 — Exclusion logic
// ══════════════════════════════════════════════════
runSuite("Wave 25 — SERP exclusion", () => {
	test("excludes own apex", () => {
		assert(
			sigInternals.isSerpExcluded("havefunnels.com", "havefunnels.com"),
			"apex match",
		);
		assert(
			sigInternals.isSerpExcluded("blog.havefunnels.com", "havefunnels.com"),
			"subdomain of apex",
		);
	});
	test("excludes social media + review sites", () => {
		assert(sigInternals.isSerpExcluded("linkedin.com", null), "expected");
		assert(sigInternals.isSerpExcluded("g2.com", null), "expected");
		assert(sigInternals.isSerpExcluded("trustpilot.com", null), "expected");
		assert(sigInternals.isSerpExcluded("br.linkedin.com", null), "subdomain of excluded");
	});
	test("does NOT exclude unknown competitor host", () => {
		assert(!sigInternals.isSerpExcluded("funnelmasters.com.br", null), "expected");
		assert(!sigInternals.isSerpExcluded("clickfunnels.com", "havefunnels.com"), "expected");
	});
	test("deriveOwnApex strips subdomains", () => {
		const byType = new Map<EvidenceType, Evidence[]>();
		byType.set(EvidenceType.PageContent, [
			pageContentEvidenceWithUrl("https://www.havefunnels.com/pricing"),
		]);
		assertEqual(sigInternals.deriveOwnApex(byType), "havefunnels.com");
	});
});

// ══════════════════════════════════════════════════
// Suite 2 — brand_serp_encroachment
// ══════════════════════════════════════════════════
runSuite("Wave 25 — brand_serp_encroachment", () => {
	test("does NOT fire when only own + excluded hosts in top-5", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("havefunnels", "brand", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "linkedin.com" },
					{ rank: 3, host: "g2.com" },
					{ rank: 4, host: "havefunnels.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://www.havefunnels.com/"),
		);
		assert(
			!hasInf(inferences, "brand_serp_encroachment"),
			"only excluded hosts and own apex — no fire",
		);
	});

	test("fires medium when 1 competitor at rank 4-5", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("havefunnels", "brand", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "havefunnels.com" },
					{ rank: 3, host: "linkedin.com" },
					{ rank: 4, host: "clickfunnels.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		const inf = infByKey(inferences, "brand_serp_encroachment");
		assert(!!inf, "expected brand_serp_encroachment to fire");
		assertEqual(inf?.severity_hint, "medium");
	});

	test("fires high when 1 competitor in top-3", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("havefunnels", "brand", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "competidor.com.br" },
					{ rank: 3, host: "havefunnels.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		const inf = infByKey(inferences, "brand_serp_encroachment");
		assertEqual(inf?.severity_hint, "high");
	});

	test("fires high when 2+ competitors regardless of rank", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("havefunnels", "brand", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "havefunnels.com" },
					{ rank: 3, host: "havefunnels.com" },
					{ rank: 4, host: "comp1.com" },
					{ rank: 5, host: "comp2.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		const inf = infByKey(inferences, "brand_serp_encroachment");
		assertEqual(inf?.severity_hint, "high");
	});

	test("dedupes hosts and keeps best rank", () => {
		const { signals } = runPipeline(
			[
				makeSerpEvidence("havefunnels", "brand", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "comp.com" },
					{ rank: 4, host: "comp.com" },
					{ rank: 5, host: "comp.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		const sig = signals.find(
			(s) => s.signal_key === "competitive.brand_serp_encroachment",
		);
		assertEqual(sig?.value, "1"); // dedupes to 1 unique host
		assertEqual(sig?.numeric_value, 2); // best rank kept
	});
});

// ══════════════════════════════════════════════════
// Suite 3 — serp_overlap_detected
// ══════════════════════════════════════════════════
runSuite("Wave 25 — serp_overlap_detected", () => {
	test("does NOT fire when no host appears in ≥2 category queries", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("funil de vendas", "category", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "compA.com" },
				]),
				makeSerpEvidence("plataforma de vendas", "category", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "compB.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		assert(!hasInf(inferences, "serp_overlap_detected"), "expected");
	});

	test("fires low when 1-2 competitors overlap ≥2 queries", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("funil de vendas", "category", [
					{ rank: 1, host: "havefunnels.com" },
					{ rank: 2, host: "shared.com" },
				]),
				makeSerpEvidence("plataforma de vendas", "category", [
					{ rank: 1, host: "shared.com" },
					{ rank: 2, host: "havefunnels.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://havefunnels.com/"),
		);
		const inf = infByKey(inferences, "serp_overlap_detected");
		assertEqual(inf?.severity_hint, "low");
	});

	test("fires high when 5+ competitors overlap", () => {
		const hosts = ["A.com", "B.com", "C.com", "D.com", "E.com"];
		const serps = ["q1", "q2", "q3"].map((q) =>
			makeSerpEvidence(
				q,
				"category",
				hosts.map((h, i) => ({ rank: i + 1, host: h })),
			),
		);
		const { inferences } = runPipeline(serps, pageContentEvidenceWithUrl("https://you.com/"));
		const inf = infByKey(inferences, "serp_overlap_detected");
		assertEqual(inf?.severity_hint, "high");
	});

	test("excluded hosts don't count toward overlap", () => {
		const { inferences } = runPipeline(
			[
				makeSerpEvidence("funil de vendas", "category", [
					{ rank: 1, host: "linkedin.com" },
					{ rank: 2, host: "g2.com" },
				]),
				makeSerpEvidence("plataforma de vendas", "category", [
					{ rank: 1, host: "linkedin.com" },
					{ rank: 2, host: "g2.com" },
				]),
			],
			pageContentEvidenceWithUrl("https://you.com/"),
		);
		assert(!hasInf(inferences, "serp_overlap_detected"), "expected");
	});
});

// ══════════════════════════════════════════════════
// Suite 4 — Empty SERP fixtures
// ══════════════════════════════════════════════════
runSuite("Wave 25 — empty SERP data", () => {
	test("no SERP evidence = no SERP signals", () => {
		const { signals, inferences } = runPipeline([]);
		const serpSignals = signals.filter((s) =>
			s.signal_key.startsWith("competitive.brand_serp") ||
			s.signal_key.startsWith("competitive.serp_overlap"),
		);
		assertEqual(serpSignals.length, 0);
		assert(!hasInf(inferences, "brand_serp_encroachment"), "expected");
		assert(!hasInf(inferences, "serp_overlap_detected"), "expected");
	});
});

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════");
console.log("  WAVE 25 — COMPETITIVE LENS SERP TEST SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed} passed, ${suitesFailed} failed`);
console.log("═══════════════════════════════════════════════\n");
if (suitesFailed > 0) {
	console.log(`❌ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`✅ All ${suitesPassed} suites passed`);
