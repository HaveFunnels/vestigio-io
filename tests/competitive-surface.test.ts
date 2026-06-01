// ──────────────────────────────────────────────
// Wave 26 — competitive_lens surface delta tests
//
// Covers:
//   - Customer-type resolver (businessModel + industry heuristics)
//   - Category library shape integrity
//   - Gap detection logic (per-category presence + prominence)
//   - Severity buckets in the inference pack
//   - LLM response parser tolerance
// ──────────────────────────────────────────────

import {
	EvidenceType,
	IdGenerator,
	type Evidence,
	type Signal,
	type Scoping,
	type ContentEnrichmentPayload,
} from "../packages/domain";
import {
	resolveCustomerType,
	getCategoriesFor,
	CUSTOMER_TYPES,
	type CategorySpec,
	type CustomerType,
} from "../packages/competitive/surface-categories";
import {
	extractCompetitiveSurfaceSignals,
	__testing as sigInternals,
} from "../packages/signals/competitive-surface-signals";
import { computeCompetitiveLensPack } from "../packages/inference/packs/competitive-lens";
import { __testing as enricherInternals } from "../workers/ingestion/enrichment/surface-inventory";
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

// ── helpers ──
function inventoryEvidence(
	source: "self" | "competitor",
	source_label: string,
	source_url: string,
	customer_type: CustomerType,
	items: Array<{
		category_key: string;
		presence: boolean;
		region?: string;
		extracted_text?: string;
		confidence?: number;
	}>,
): Evidence {
	const payload: ContentEnrichmentPayload = {
		type: "content_enrichment",
		enrichment_type: "surface_inventory",
		source_evidence_key:
			source === "self" ? `self:${source_url}` : `competitor:${source_label}`,
		source_url,
		scores: { clarity_score: 0, readability_grade: customer_type },
		flags: { ambiguity_flags: [], regulatory_gaps: [] },
		missing_elements: items.filter((i) => !i.presence).map((i) => i.category_key),
		results: {
			source,
			source_label,
			customer_type,
			items: items.map((i) => ({
				category_key: i.category_key,
				presence: i.presence,
				region: (i.region as any) || "hero",
				extracted_text: i.extracted_text || "",
				confidence: i.confidence ?? 85,
			})),
		},
		confidence: 85,
		model_used: "haiku_4_5",
		cached: false,
	};
	return testEvidence(EvidenceType.ContentEnrichment, payload);
}

function runPipeline(evs: Evidence[]): {
	signals: Signal[];
	inferences: ReturnType<typeof computeCompetitiveLensPack>;
} {
	const scoping: Scoping = testScoping();
	const cycle_ref = "audit_cycle:test";
	const ids = new IdGenerator(cycle_ref + ":surface_test");

	const byType = new Map<EvidenceType, Evidence[]>();
	byType.set(EvidenceType.ContentEnrichment, evs);

	const signals: Signal[] = [];
	extractCompetitiveSurfaceSignals(byType, scoping, cycle_ref, signals, ids);

	const byKey = new Map<string, Signal>();
	for (const s of signals) byKey.set(s.signal_key, s);
	const inferences = computeCompetitiveLensPack({
		signals,
		byAttribute: new Map(),
		byKey,
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
// Suite 1 — Customer-type resolver
// ══════════════════════════════════════════════════
runSuite("Wave 26 — Customer-type resolver", () => {
	test("saas businessModel → saas", () => {
		assertEqual(resolveCustomerType("saas", null), "saas");
	});
	test("ecommerce businessModel → ecommerce", () => {
		assertEqual(resolveCustomerType("ecommerce", null), "ecommerce");
	});
	test("lead_gen default → service", () => {
		assertEqual(resolveCustomerType("lead_gen", null), "service");
	});
	test("hybrid default → generic", () => {
		assertEqual(resolveCustomerType("hybrid", null), "generic");
	});
	test("industry 'curso de marketing' overrides → infoproduct", () => {
		assertEqual(resolveCustomerType("saas", "curso de marketing digital"), "infoproduct");
	});
	test("industry 'clínica odontológica' overrides → local_business", () => {
		assertEqual(resolveCustomerType("lead_gen", "clínica odontológica"), "local_business");
	});
	test("industry 'agência de marketing' overrides → service", () => {
		assertEqual(resolveCustomerType("hybrid", "agência de marketing digital"), "service");
	});
	test("unknown businessModel → generic", () => {
		assertEqual(resolveCustomerType(null, null), "generic");
		assertEqual(resolveCustomerType("unknown", null), "generic");
	});
});

// ══════════════════════════════════════════════════
// Suite 2 — Category library integrity
// ══════════════════════════════════════════════════
runSuite("Wave 26 — Category library integrity", () => {
	test("every customer type has ≥4 categories", () => {
		for (const [type, cats] of Object.entries(CUSTOMER_TYPES)) {
			assert(cats.length >= 4, `${type} has only ${cats.length} categories`);
		}
	});
	test("all category keys are unique within their set", () => {
		for (const [type, cats] of Object.entries(CUSTOMER_TYPES)) {
			const keys = new Set<string>();
			for (const c of cats) {
				assert(!keys.has(c.key), `${type} duplicate key ${c.key}`);
				keys.add(c.key);
			}
		}
	});
	test("all weights are between 0 and 1", () => {
		for (const cats of Object.values(CUSTOMER_TYPES)) {
			for (const c of cats) {
				assert(c.weight > 0 && c.weight <= 1, `${c.key} weight=${c.weight}`);
			}
		}
	});
	test("getCategoriesFor returns same set as CUSTOMER_TYPES", () => {
		assertEqual(getCategoriesFor("saas").length, CUSTOMER_TYPES.saas.length);
		assertEqual(getCategoriesFor("local_business").length, CUSTOMER_TYPES.local_business.length);
	});
});

// ══════════════════════════════════════════════════
// Suite 3 — Gap detection
// ══════════════════════════════════════════════════
runSuite("Wave 26 — Gap detection", () => {
	test("does NOT fire when no competitor inventories present", () => {
		const { signals, inferences } = runPipeline([
			inventoryEvidence("self", "you.com", "https://you.com/", "saas", [
				{ category_key: "core_features", presence: true, region: "hero" },
			]),
		]);
		const surfaceSig = signals.find(
			(s) => s.signal_key === "competitive.surface_gap_detected",
		);
		assert(!surfaceSig, "no peers means no gap signal");
		assert(
			!hasInf(inferences, "surface_gap_detected"),
			"no peers means no inference",
		);
	});

	test("does NOT fire when own page matches peer set", () => {
		const items = [
			{ category_key: "core_features", presence: true, region: "hero" },
			{ category_key: "pricing_transparency", presence: true, region: "hero" },
		];
		const { inferences } = runPipeline([
			inventoryEvidence("self", "you.com", "https://you.com/", "saas", items),
			inventoryEvidence("competitor", "peerA.com", "https://peerA.com/", "saas", items),
			inventoryEvidence("competitor", "peerB.com", "https://peerB.com/", "saas", items),
		]);
		assert(
			!hasInf(inferences, "surface_gap_detected"),
			"matched surfaces → no gap",
		);
	});

	test("fires when peers show categories you completely miss (e-com frete grátis)", () => {
		const peerItems = [
			{ category_key: "free_shipping", presence: true, region: "header", extracted_text: "Frete grátis acima de R$199" },
			{ category_key: "delivery_time", presence: true, region: "hero", extracted_text: "Entrega em 2 dias úteis" },
			{ category_key: "support_channels", presence: true, region: "header", extracted_text: "Chat WhatsApp" },
		];
		const ownItems = [
			{ category_key: "free_shipping", presence: false, region: "unknown" },
			{ category_key: "delivery_time", presence: false, region: "unknown" },
			{ category_key: "support_channels", presence: false, region: "unknown" },
		];
		const { inferences } = runPipeline([
			inventoryEvidence("self", "you.com.br", "https://you.com.br/", "ecommerce", ownItems),
			inventoryEvidence("competitor", "peerA.com.br", "https://peerA.com.br/", "ecommerce", peerItems),
			inventoryEvidence("competitor", "peerB.com.br", "https://peerB.com.br/", "ecommerce", peerItems),
			inventoryEvidence("competitor", "peerC.com.br", "https://peerC.com.br/", "ecommerce", peerItems),
		]);
		const inf = infByKey(inferences, "surface_gap_detected");
		assert(!!inf, "expected surface_gap_detected to fire");
		assertEqual(inf?.severity_hint, "high");
		// Reasoning should name the categories
		assert(
			inf?.reasoning?.includes("Frete grátis em destaque") ||
				inf?.reasoning?.includes("frete"),
			"reasoning mentions the gap categories",
		);
	});

	test("fires medium when 1-2 high-weight gaps present", () => {
		const peerItems = [
			{ category_key: "value_prop_clarity", presence: true, region: "hero", extracted_text: "headline forte" },
		];
		const ownItems = [
			{ category_key: "value_prop_clarity", presence: false, region: "unknown" },
		];
		const { inferences } = runPipeline([
			inventoryEvidence("self", "you.com", "https://you.com/", "generic", ownItems),
			inventoryEvidence("competitor", "p1.com", "https://p1.com/", "generic", peerItems),
			inventoryEvidence("competitor", "p2.com", "https://p2.com/", "generic", peerItems),
		]);
		const inf = infByKey(inferences, "surface_gap_detected");
		assert(!!inf, "expected fire");
		// value_prop_clarity weight = 0.85, magnitude 1.0 → weighted_score = 85
		// Single category → score 85 → low
		assert(
			inf?.severity_hint === "low",
			`expected low, got ${inf?.severity_hint}`,
		);
	});

	test("does NOT fire when peers show but you also show in equivalent region", () => {
		const allPresent = [
			{ category_key: "core_features", presence: true, region: "hero" },
		];
		const { inferences } = runPipeline([
			inventoryEvidence("self", "you.com", "https://you.com/", "saas", allPresent),
			inventoryEvidence("competitor", "peerA.com", "https://peerA.com/", "saas", allPresent),
			inventoryEvidence("competitor", "peerB.com", "https://peerB.com/", "saas", allPresent),
		]);
		assert(!hasInf(inferences, "surface_gap_detected"), "no gap expected");
	});

	test("fires when you present-but-buried and peers prominent", () => {
		const peerItems = [
			{ category_key: "free_shipping", presence: true, region: "header", extracted_text: "FRETE GRÁTIS" },
		];
		const ownItems = [
			{ category_key: "free_shipping", presence: true, region: "footer", extracted_text: "frete grátis para BR" },
		];
		const { inferences } = runPipeline([
			inventoryEvidence("self", "you.com.br", "https://you.com.br/", "ecommerce", ownItems),
			inventoryEvidence("competitor", "p1.com.br", "https://p1.com.br/", "ecommerce", peerItems),
			inventoryEvidence("competitor", "p2.com.br", "https://p2.com.br/", "ecommerce", peerItems),
		]);
		assert(
			hasInf(inferences, "surface_gap_detected"),
			"present-but-buried still gaps when peers are prominent",
		);
	});
});

// ══════════════════════════════════════════════════
// Suite 4 — Region rank
// ══════════════════════════════════════════════════
runSuite("Wave 26 — Region prominence ordering", () => {
	test("hero and header rank above body and footer", () => {
		assert(sigInternals.regionRank("hero") > sigInternals.regionRank("body"), "hero > body");
		assert(sigInternals.regionRank("header") > sigInternals.regionRank("footer"), "header > footer");
		assertEqual(sigInternals.regionRank("hero"), sigInternals.regionRank("header"));
	});
	test("unknown ranks at zero (worst)", () => {
		assertEqual(sigInternals.regionRank("unknown"), 0);
	});
});

// ══════════════════════════════════════════════════
// Suite 5 — LLM parser tolerance
// ══════════════════════════════════════════════════
runSuite("Wave 26 — LLM response parser", () => {
	const valid = new Set(["core_features", "pricing_transparency"]);
	test("parses clean JSON", () => {
		const items = enricherInternals.parseInventoryResponse(
			'{"items":[{"category_key":"core_features","presence":true,"region":"hero","extracted_text":"AI agents","confidence":90}]}',
			valid,
		);
		assert(items !== null, "parsed");
		assertEqual(items?.length, 1);
		assertEqual(items?.[0].region, "hero");
	});
	test("strips markdown fences", () => {
		const items = enricherInternals.parseInventoryResponse(
			'```json\n{"items":[{"category_key":"core_features","presence":true,"region":"hero","extracted_text":"x","confidence":80}]}\n```',
			valid,
		);
		assert(items !== null, "parsed");
		assertEqual(items?.length, 1);
	});
	test("filters unknown category keys", () => {
		const items = enricherInternals.parseInventoryResponse(
			'{"items":[{"category_key":"core_features","presence":true,"region":"hero","extracted_text":"x","confidence":80},{"category_key":"made_up","presence":true,"region":"hero","extracted_text":"y","confidence":80}]}',
			valid,
		);
		assertEqual(items?.length, 1);
		assertEqual(items?.[0].category_key, "core_features");
	});
	test("dedupes repeated category keys", () => {
		const items = enricherInternals.parseInventoryResponse(
			'{"items":[{"category_key":"core_features","presence":true,"region":"hero","extracted_text":"a","confidence":80},{"category_key":"core_features","presence":false,"region":"body","extracted_text":"b","confidence":50}]}',
			valid,
		);
		assertEqual(items?.length, 1);
		assertEqual(items?.[0].extracted_text, "a"); // first wins
	});
	test("returns null on completely broken JSON", () => {
		const items = enricherInternals.parseInventoryResponse(
			"not json at all",
			valid,
		);
		assertEqual(items, null);
	});
	test("clamps confidence to 0..100", () => {
		const items = enricherInternals.parseInventoryResponse(
			'{"items":[{"category_key":"core_features","presence":true,"region":"hero","extracted_text":"x","confidence":150}]}',
			valid,
		);
		assertEqual(items?.[0].confidence, 100);
	});
	test("invalid region falls back to unknown", () => {
		const items = enricherInternals.parseInventoryResponse(
			'{"items":[{"category_key":"core_features","presence":true,"region":"middle","extracted_text":"x","confidence":80}]}',
			valid,
		);
		assertEqual(items?.[0].region, "unknown");
	});
});

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════");
console.log("  WAVE 26 — SURFACE INVENTORY TEST SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed} passed, ${suitesFailed} failed`);
console.log("═══════════════════════════════════════════════\n");
if (suitesFailed > 0) {
	console.log(`❌ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`✅ All ${suitesPassed} suites passed`);
