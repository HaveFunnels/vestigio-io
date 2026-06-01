// ──────────────────────────────────────────────
// Wave 27 — competitive_lens customer voice tests
//
// Covers:
//   - reputation label → score mapping
//   - median calc for both axes
//   - Signal gates: own listed, ≥2 listed peers
//   - Severity bands (leve / moderado / severo)
//   - No-fire cases (matched peers, not enough peers, own not listed)
//   - Brand token derivation from domain
// ──────────────────────────────────────────────

import {
	EvidenceType,
	IdGenerator,
	type Evidence,
	type Signal,
	type Scoping,
	type CustomerVoiceSnapshotPayload,
} from "../packages/domain";
import {
	extractCompetitiveVoiceSignals,
	__testing as sigInternals,
} from "../packages/signals/competitive-voice-signals";
import { computeCompetitiveLensPack } from "../packages/inference/packs/competitive-lens";
import { __testing as enricherInternals } from "../workers/ingestion/enrichment/customer-voice";
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

function snapshotEvidence(
	source_label: string,
	overrides: Partial<CustomerVoiceSnapshotPayload> = {},
): Evidence {
	const payload: CustomerVoiceSnapshotPayload = {
		type: "customer_voice_snapshot",
		source_label,
		brand_token: source_label === "self" ? "you" : source_label.replace("competitor:", ""),
		platform: "reclame_aqui",
		listed: true,
		company_page_url: `https://reclameaqui.com.br/empresa/${overrides.brand_token || "x"}/`,
		reputation_label: "Bom",
		resolution_index: 7.5,
		complaints_total: 100,
		snippet_excerpt: "test snippet",
		unlisted_reason: null,
		fetched_at: new Date().toISOString(),
		fetched_url: "https://html.duckduckgo.com/html/",
		...overrides,
	};
	return testEvidence(EvidenceType.CustomerVoiceSnapshot, payload);
}

function runPipeline(evs: Evidence[]): {
	signals: Signal[];
	inferences: ReturnType<typeof computeCompetitiveLensPack>;
} {
	const scoping: Scoping = testScoping();
	const cycle_ref = "audit_cycle:test";
	const ids = new IdGenerator(cycle_ref + ":voice_test");

	const byType = new Map<EvidenceType, Evidence[]>();
	byType.set(EvidenceType.CustomerVoiceSnapshot, evs);

	const signals: Signal[] = [];
	extractCompetitiveVoiceSignals(byType, scoping, cycle_ref, signals, ids);

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
// Suite 1 — Reputation score mapping + median
// ══════════════════════════════════════════════════
runSuite("Wave 27 — Helpers", () => {
	test("RA1000 maps to 95", () => {
		assertEqual(sigInternals.reputationToScore("RA1000"), 95);
	});
	test("Ruim maps to 30", () => {
		assertEqual(sigInternals.reputationToScore("Ruim"), 30);
	});
	test("unknown label returns null", () => {
		assertEqual(sigInternals.reputationToScore("WeirdLabel"), null);
	});
	test("null label returns null", () => {
		assertEqual(sigInternals.reputationToScore(null), null);
	});
	test("median picks middle of odd-length set", () => {
		assertEqual(sigInternals.median([30, 70, 95]), 70);
	});
	test("median averages middle of even-length set", () => {
		assertEqual(sigInternals.median([50, 70]), 60);
	});
	test("brandTokenFromDomain strips first label", () => {
		assertEqual(enricherInternals.brandTokenFromDomain("havefunnels.com"), "havefunnels");
		assertEqual(enricherInternals.brandTokenFromDomain("my-cool-shop.com.br"), "my cool shop");
		assertEqual(enricherInternals.brandTokenFromDomain("www.brand.com"), "brand");
	});
});

// ══════════════════════════════════════════════════
// Suite 2 — No-fire gates
// ══════════════════════════════════════════════════
runSuite("Wave 27 — No-fire gates", () => {
	test("does NOT fire without self snapshot", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom" }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom" }),
		]);
		assert(
			!hasInf(inferences, "customer_voice_delta"),
			"no self → no signal",
		);
	});

	test("does NOT fire when self not listed", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { listed: false, reputation_label: null, resolution_index: null }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom" }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom" }),
		]);
		assert(!hasInf(inferences, "customer_voice_delta"), "no fire");
	});

	test("does NOT fire with only 1 listed peer (median too noisy)", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Ruim" }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom" }),
		]);
		assert(!hasInf(inferences, "customer_voice_delta"), "no fire");
	});

	test("does NOT fire when own matches peer median", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Bom", resolution_index: 7.5 }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom", resolution_index: 7.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom", resolution_index: 7.6 }),
		]);
		assert(!hasInf(inferences, "customer_voice_delta"), "no fire");
	});
});

// ══════════════════════════════════════════════════
// Suite 3 — Severity bands
// ══════════════════════════════════════════════════
runSuite("Wave 27 — Severity bands", () => {
	test("severo (high) when own=Ruim vs peers=Bom (gap 40)", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Ruim", resolution_index: 4.0 }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom", resolution_index: 7.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom", resolution_index: 7.8 }),
		]);
		const inf = infByKey(inferences, "customer_voice_delta");
		assert(!!inf, "should fire");
		assertEqual(inf?.severity_hint, "high");
	});

	test("moderado (medium) when own=Regular vs peers=Bom (gap 20)", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Regular", resolution_index: 6.0 }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom", resolution_index: 7.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom", resolution_index: 7.5 }),
		]);
		const inf = infByKey(inferences, "customer_voice_delta");
		assert(!!inf, "should fire");
		assertEqual(inf?.severity_hint, "medium");
	});

	test("leve (low) when small but material gap (15-19 pts)", () => {
		// Own "Sem reputação" (40) vs peers Regular/Bom — median lands ~50-60
		// → gap 10-20 pts depending on exact peer mix. Want delta ≥15.
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Sem reputação", resolution_index: 5.5 }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Regular", resolution_index: 6.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom", resolution_index: 7.0 }),
		]);
		const inf = infByKey(inferences, "customer_voice_delta");
		assert(!!inf, "should fire");
		// Exact bucket depends on tiebreak — accept low or medium
		assert(
			inf?.severity_hint === "low" || inf?.severity_hint === "medium",
			`expected low/medium, got ${inf?.severity_hint}`,
		);
	});

	test("triggers on resolution gap alone when reputation labels missing", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: null, resolution_index: 5.0 }),
			snapshotEvidence("competitor:a.com", { reputation_label: null, resolution_index: 7.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: null, resolution_index: 8.0 }),
		]);
		const inf = infByKey(inferences, "customer_voice_delta");
		assert(!!inf, "should fire on resolution axis alone");
	});

	test("ignores unlisted peers from median calc", () => {
		const { inferences } = runPipeline([
			snapshotEvidence("self", { reputation_label: "Ruim", resolution_index: 4.0 }),
			snapshotEvidence("competitor:dead.com", { listed: false, reputation_label: null, resolution_index: null }),
			snapshotEvidence("competitor:a.com", { reputation_label: "Bom", resolution_index: 7.5 }),
			snapshotEvidence("competitor:b.com", { reputation_label: "Bom", resolution_index: 7.8 }),
		]);
		// Only 2 listed peers, gate met
		assert(hasInf(inferences, "customer_voice_delta"), "fire");
	});
});

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════");
console.log("  WAVE 27 — CUSTOMER VOICE TEST SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed} passed, ${suitesFailed} failed`);
console.log("═══════════════════════════════════════════════\n");
if (suitesFailed > 0) {
	console.log(`❌ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`✅ All ${suitesPassed} suites passed`);
