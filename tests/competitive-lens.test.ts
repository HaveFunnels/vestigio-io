// ──────────────────────────────────────────────
// Wave 24 — competitive_lens pack tests
//
// Golden fixtures for CompetitorPageSnapshot + own copy/trust signals.
// Each test constructs evidence + signals inline, runs the extractor
// + inference pack, and asserts the expected severity / mirror count.
// ──────────────────────────────────────────────

import {
	EvidenceType,
	IdGenerator,
	SignalCategory,
	type Evidence,
	type Signal,
	type Scoping,
	type CompetitorPageSnapshotPayload,
	type CopyElementsPayload,
} from "../packages/domain";
import { extractCompetitiveSignals, __testing as sigInternals } from "../packages/signals/competitive-signals";
import { computeCompetitiveLensPack } from "../packages/inference/packs/competitive-lens";
import { testScoping, testEvidence, testSignal } from "./helpers";
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

function snapshotPayload(
	domain: string,
	opts: Partial<Omit<CompetitorPageSnapshotPayload, "type" | "competitor_domain">> = {},
): CompetitorPageSnapshotPayload {
	return {
		type: "competitor_page_snapshot",
		competitor_domain: domain,
		url_fetched: `https://${domain}/`,
		fetch_failed: false,
		fetch_error: null,
		http_status: 200,
		title: null,
		h1: null,
		meta_description: null,
		hero_text: null,
		body_text_snippet: null,
		headings: [],
		cta_texts: [],
		trust_snapshot: {
			https_redirect: true,
			hsts_present: false,
			csp_present: false,
			x_frame_options_present: false,
			x_content_type_options_present: false,
			referrer_policy_present: false,
			permissions_policy_present: false,
			headers_score: 0,
			dmarc_present: false,
			dmarc_policy: null,
			spf_present: false,
		},
		fetched_at: new Date().toISOString(),
		...opts,
	};
}

function copyElementsPayload(
	url: string,
	overrides: Partial<CopyElementsPayload> = {},
): CopyElementsPayload {
	return {
		type: "copy_elements",
		url,
		page_type: "homepage",
		funnel_stage: "awareness",
		h1: null,
		subheadline: null,
		cta_texts: [],
		primary_cta: null,
		social_proof_elements: [],
		trust_signals: [],
		urgency_indicators: [],
		above_fold_text: "",
		navigation_labels: [],
		body_text: "",
		word_count: 0,
		cta_count: 0,
		has_form: false,
		has_pricing_table: false,
		has_faq: false,
		...overrides,
	};
}

function runPipeline(
	snapshots: CompetitorPageSnapshotPayload[],
	ownCopy: CopyElementsPayload | null = null,
	preexistingSignals: Signal[] = [],
): { signals: Signal[]; inferences: ReturnType<typeof computeCompetitiveLensPack> } {
	const scoping: Scoping = testScoping();
	const cycle_ref = "audit_cycle:test";
	const ids = new IdGenerator(cycle_ref + ":competitive_test");

	const byType = new Map<EvidenceType, Evidence[]>();
	byType.set(
		EvidenceType.CompetitorPageSnapshot,
		snapshots.map((p) => testEvidence(EvidenceType.CompetitorPageSnapshot, p)),
	);
	if (ownCopy) {
		byType.set(EvidenceType.CopyElements, [
			testEvidence(EvidenceType.CopyElements, ownCopy),
		]);
	}

	const signals: Signal[] = [...preexistingSignals];
	const byKey = new Map<string, Signal>();
	for (const s of signals) byKey.set(s.signal_key, s);
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
// Suite 1 — Helpers
// ══════════════════════════════════════════════════
runSuite("Wave 24 — Internal helpers", () => {
	test("normalizeText lowercases + strips diacritics + punctuation", () => {
		assertEqual(
			sigInternals.normalizeText("Olá, Mundo! É bom"),
			"ola mundo e bom",
		);
	});
	test("shingles of n=4 produces sliding windows", () => {
		const set = sigInternals.shingles("um dois três quatro cinco", 4);
		assert(set.has("um dois tres quatro"), "first shingle present");
		assert(set.has("dois tres quatro cinco"), "second shingle present");
	});
	test("median picks middle of odd-length set", () => {
		assertEqual(sigInternals.median([10, 50, 80]), 50);
	});
	test("median averages middle of even-length set", () => {
		assertEqual(sigInternals.median([10, 20, 80, 90]), 50);
	});
	test("dmarcPolicyScore weights reject highest", () => {
		assertEqual(sigInternals.dmarcPolicyScore(true, "reject"), 100);
		assertEqual(sigInternals.dmarcPolicyScore(true, "quarantine"), 60);
		assertEqual(sigInternals.dmarcPolicyScore(true, "none"), 30);
		assertEqual(sigInternals.dmarcPolicyScore(false, null), 0);
	});
});

// ══════════════════════════════════════════════════
// Suite 2 — Copy mirror detection
// ══════════════════════════════════════════════════
runSuite("Wave 24 — Copy mirror detected", () => {
	const ownCopy = copyElementsPayload("https://you.com/", {
		h1: "Sempre vigiando seu funil de vendas",
		subheadline: "Detecção contínua de regressões críticas",
		above_fold_text:
			"Sempre vigiando seu funil de vendas — detecção contínua de regressões críticas que custam dinheiro.",
	});

	test("does NOT fire when no competitors share phrases", () => {
		const { inferences } = runPipeline(
			[
				snapshotPayload("acme.com", {
					h1: "Soluções avançadas em ERP corporativo",
					title: "Acme — ERP",
					body_text_snippet: "Nossa plataforma de ERP integra módulos diversos",
				}),
			],
			ownCopy,
		);
		assert(
			!hasInf(inferences, "copy_mirror_detected"),
			"should not fire when no shared phrases",
		);
	});

	test("fires low when 1 competitor mirrors hero phrases", () => {
		const { inferences } = runPipeline(
			[
				snapshotPayload("copia.com", {
					h1: "Sempre vigiando seu funil de vendas",
					body_text_snippet:
						"Sempre vigiando seu funil de vendas com detecção contínua de regressões críticas.",
				}),
			],
			ownCopy,
		);
		const inf = infByKey(inferences, "copy_mirror_detected");
		assert(!!inf, "expected copy_mirror_detected to fire");
		assertEqual(inf?.severity_hint, "low");
	});

	test("fires medium when 2-3 competitors mirror", () => {
		const { inferences } = runPipeline(
			[
				snapshotPayload("copia1.com", {
					h1: "Sempre vigiando seu funil de vendas",
					body_text_snippet:
						"Sempre vigiando seu funil de vendas detecção contínua de regressões críticas",
				}),
				snapshotPayload("copia2.com", {
					h1: "Sempre vigiando seu funil de vendas",
					body_text_snippet:
						"Sempre vigiando seu funil de vendas detecção contínua de regressões críticas",
				}),
			],
			ownCopy,
		);
		const inf = infByKey(inferences, "copy_mirror_detected");
		assertEqual(inf?.severity_hint, "medium");
	});

	test("fires high when 4+ competitors mirror", () => {
		const snaps = [1, 2, 3, 4].map((n) =>
			snapshotPayload(`copia${n}.com`, {
				h1: "Sempre vigiando seu funil de vendas",
				body_text_snippet:
					"Sempre vigiando seu funil de vendas detecção contínua de regressões críticas",
			}),
		);
		const { inferences } = runPipeline(snaps, ownCopy);
		const inf = infByKey(inferences, "copy_mirror_detected");
		assertEqual(inf?.severity_hint, "high");
	});
});

// ══════════════════════════════════════════════════
// Suite 3 — Trust posture lag
// ══════════════════════════════════════════════════
runSuite("Wave 24 — Trust posture lag", () => {
	function ownIsWeakSignals(): Signal[] {
		// Simulate "you" with weak trust posture: DMARC absent + HSTS missing.
		return [
			testSignal({
				signal_key: "email.dmarc_absent",
				attribute: "email_auth.dmarc.present",
				value: "false",
				category: SignalCategory.Security,
			}),
			testSignal({
				signal_key: "email.spf_absent",
				attribute: "email_auth.spf.present",
				value: "false",
				category: SignalCategory.Security,
			}),
			testSignal({
				signal_key: "hsts_missing",
				attribute: "security.hsts.missing",
				value: "true",
				category: SignalCategory.Security,
			}),
		];
	}

	test("does NOT fire when peer set has only 1 competitor", () => {
		const { inferences } = runPipeline(
			[
				snapshotPayload("acme.com", {
					trust_snapshot: {
						https_redirect: true,
						hsts_present: true,
						csp_present: true,
						x_frame_options_present: true,
						x_content_type_options_present: true,
						referrer_policy_present: true,
						permissions_policy_present: true,
						headers_score: 100,
						dmarc_present: true,
						dmarc_policy: "reject",
						spf_present: true,
					},
				}),
			],
			null,
			ownIsWeakSignals(),
		);
		assert(
			!hasInf(inferences, "trust_posture_lag"),
			"need ≥2 peers to compute median",
		);
	});

	test("fires when peer median is meaningfully above own score", () => {
		const strongTrust = (override?: Partial<CompetitorPageSnapshotPayload["trust_snapshot"]>) => ({
			https_redirect: true,
			hsts_present: true,
			csp_present: true,
			x_frame_options_present: true,
			x_content_type_options_present: true,
			referrer_policy_present: true,
			permissions_policy_present: true,
			headers_score: 100,
			dmarc_present: true,
			dmarc_policy: "reject" as const,
			spf_present: true,
			...override,
		});
		const { inferences } = runPipeline(
			[
				snapshotPayload("acme.com", { trust_snapshot: strongTrust() }),
				snapshotPayload("bigcorp.com", { trust_snapshot: strongTrust() }),
				snapshotPayload("strongco.com", { trust_snapshot: strongTrust() }),
			],
			null,
			ownIsWeakSignals(),
		);
		const inf = infByKey(inferences, "trust_posture_lag");
		assert(!!inf, "expected trust_posture_lag to fire");
		assert(
			inf?.severity_hint === "high" || inf?.severity_hint === "medium",
			`expected medium/high severity, got ${inf?.severity_hint}`,
		);
	});

	test("does NOT fire when own score matches peer median", () => {
		// Strong own signals: no weakness signals = all defaults to good.
		const { inferences } = runPipeline(
			[
				snapshotPayload("peer1.com", {
					trust_snapshot: {
						https_redirect: true,
						hsts_present: true,
						csp_present: true,
						x_frame_options_present: true,
						x_content_type_options_present: true,
						referrer_policy_present: true,
						permissions_policy_present: true,
						headers_score: 100,
						dmarc_present: true,
						dmarc_policy: "reject",
						spf_present: true,
					},
				}),
				snapshotPayload("peer2.com", {
					trust_snapshot: {
						https_redirect: true,
						hsts_present: true,
						csp_present: true,
						x_frame_options_present: true,
						x_content_type_options_present: true,
						referrer_policy_present: true,
						permissions_policy_present: true,
						headers_score: 100,
						dmarc_present: true,
						dmarc_policy: "reject",
						spf_present: true,
					},
				}),
			],
			null,
			[], // no own weakness signals — defaults give own_score ~100
		);
		assert(
			!hasInf(inferences, "trust_posture_lag"),
			"own score and peer median should be even",
		);
	});

	test("excludes failed snapshots from median calc", () => {
		const { inferences } = runPipeline(
			[
				snapshotPayload("dead.com", { fetch_failed: true }),
				snapshotPayload("alive1.com", {
					trust_snapshot: {
						https_redirect: true,
						hsts_present: true,
						csp_present: true,
						x_frame_options_present: true,
						x_content_type_options_present: true,
						referrer_policy_present: true,
						permissions_policy_present: true,
						headers_score: 100,
						dmarc_present: true,
						dmarc_policy: "reject",
						spf_present: true,
					},
				}),
			],
			null,
			ownIsWeakSignals(),
		);
		// Only 1 valid peer remains — needs 2 to fire.
		assert(
			!hasInf(inferences, "trust_posture_lag"),
			"failed snapshot should be excluded",
		);
	});
});

// ══════════════════════════════════════════════════
// Suite 4 — No snapshots = no signals
// ══════════════════════════════════════════════════
runSuite("Wave 24 — No competitor data", () => {
	test("does not crash and emits nothing when no snapshots present", () => {
		const { signals, inferences } = runPipeline([], null, []);
		assertEqual(signals.length, 0);
		assertEqual(inferences.length, 0);
	});
});

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════");
console.log("  WAVE 24 — COMPETITIVE LENS TEST SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed} passed, ${suitesFailed} failed`);
console.log("═══════════════════════════════════════════════\n");
if (suitesFailed > 0) {
	console.log(`❌ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`✅ All ${suitesPassed} suites passed`);
