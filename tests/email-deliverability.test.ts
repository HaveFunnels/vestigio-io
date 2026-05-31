// ──────────────────────────────────────────────
// Wave 23.1 — email_deliverability pack tests
//
// Golden EmailAuthRecord fixtures cover all 6 rules. Each test
// constructs an evidence row inline (no DNS calls), runs the
// signal extractor + inference pack, and asserts the expected
// inference_key fires (or doesn't fire) with the correct severity.
// ──────────────────────────────────────────────

import {
	EvidenceType,
	IdGenerator,
	Evidence,
	Signal,
	type Scoping,
} from "../packages/domain";
import type { EmailAuthRecordPayload } from "../packages/domain";
import { extractEmailDeliverabilitySignals } from "../packages/signals/email-deliverability-signals";
import { computeEmailDeliverabilityPack } from "../packages/inference/packs/email-deliverability";
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

function blankPayload(overrides: Partial<EmailAuthRecordPayload> = {}): EmailAuthRecordPayload {
	const base: EmailAuthRecordPayload = {
		type: "email_auth_record",
		apex_domain: "havefunnels.com",
		dmarc: {
			found: false,
			raw: null,
			policy: null,
			rua: null,
			subdomain_policy: null,
			lookup_failed: false,
		},
		spf: {
			found: false,
			raw: null,
			include_count: 0,
			all_qualifier: null,
			lookup_failed: false,
		},
		dkim: {
			probed_selectors: ["default", "google", "k1"],
			found_selectors: [],
			raw_by_selector: {},
			lookup_failed: false,
		},
		bimi: {
			found: false,
			raw: null,
			logo_url: null,
			vmc_url: null,
			lookup_failed: false,
		},
	};
	return { ...base, ...overrides };
}

function runPipeline(payload: EmailAuthRecordPayload): {
	signals: Signal[];
	inferences: ReturnType<typeof computeEmailDeliverabilityPack>;
} {
	const scoping: Scoping = testScoping();
	const cycle_ref = "audit_cycle:test";
	const ids = new IdGenerator(cycle_ref + ":email_deliverability_test");

	const evidence: Evidence = testEvidence(
		EvidenceType.EmailAuthRecord,
		payload,
	);
	const byType = new Map<EvidenceType, Evidence[]>([
		[EvidenceType.EmailAuthRecord, [evidence]],
	]);

	const signals: Signal[] = [];
	extractEmailDeliverabilitySignals(byType, scoping, cycle_ref, signals, ids);

	const byKey = new Map<string, Signal>(signals.map((s) => [s.signal_key, s]));
	const inferences = computeEmailDeliverabilityPack({
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

function hasInference(
	inferences: ReturnType<typeof computeEmailDeliverabilityPack>,
	key: string,
): boolean {
	return inferences.some((i) => i.inference_key === key);
}

function inferenceByKey(
	inferences: ReturnType<typeof computeEmailDeliverabilityPack>,
	key: string,
) {
	return inferences.find((i) => i.inference_key === key);
}

// ══════════════════════════════════════════════════
// Rule 1 — DMARC absent
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — DMARC absent", () => {
	test("fires when no DMARC record is present", () => {
		const { inferences } = runPipeline(blankPayload());
		assert(hasInference(inferences, "dmarc_record_absent"), "expected dmarc_record_absent to fire");
		assertEqual(inferenceByKey(inferences, "dmarc_record_absent")?.severity_hint, "critical");
	});
	test("does NOT fire when DNS lookup failed", () => {
		const { inferences } = runPipeline(
			blankPayload({ dmarc: { ...blankPayload().dmarc, lookup_failed: true } }),
		);
		assert(!hasInference(inferences, "dmarc_record_absent"), "should not fire on lookup failure");
	});
	test("does NOT fire when DMARC is present (any policy)", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dmarc: {
					found: true,
					raw: "v=DMARC1; p=reject; rua=mailto:dmarc@havefunnels.com",
					policy: "reject",
					rua: "mailto:dmarc@havefunnels.com",
					subdomain_policy: "reject",
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "dmarc_record_absent"), "dmarc_record_absent expectation");
		assert(!hasInference(inferences, "dmarc_policy_weak"), "dmarc_policy_weak expectation");
	});
});

// ══════════════════════════════════════════════════
// Rule 2 — DMARC policy weak
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — DMARC policy weak", () => {
	test("fires medium when p=none WITH rua= (monitoring only)", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dmarc: {
					found: true,
					raw: "v=DMARC1; p=none; rua=mailto:dmarc@havefunnels.com",
					policy: "none",
					rua: "mailto:dmarc@havefunnels.com",
					subdomain_policy: "none",
					lookup_failed: false,
				},
			}),
		);
		const inf = inferenceByKey(inferences, "dmarc_policy_weak");
		assert(!!inf, "expected dmarc_policy_weak to fire");
		assertEqual(inf?.severity_hint, "medium");
	});
	test("fires high when p=none WITHOUT rua=", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dmarc: {
					found: true,
					raw: "v=DMARC1; p=none",
					policy: "none",
					rua: null,
					subdomain_policy: "none",
					lookup_failed: false,
				},
			}),
		);
		assertEqual(inferenceByKey(inferences, "dmarc_policy_weak")?.severity_hint, "high");
	});
	test("fires high when p=quarantine", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dmarc: {
					found: true,
					raw: "v=DMARC1; p=quarantine; rua=mailto:dmarc@havefunnels.com",
					policy: "quarantine",
					rua: "mailto:dmarc@havefunnels.com",
					subdomain_policy: "quarantine",
					lookup_failed: false,
				},
			}),
		);
		assertEqual(inferenceByKey(inferences, "dmarc_policy_weak")?.severity_hint, "high");
	});
	test("does NOT fire when p=reject", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dmarc: {
					found: true,
					raw: "v=DMARC1; p=reject",
					policy: "reject",
					rua: null,
					subdomain_policy: "reject",
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "dmarc_policy_weak"), "dmarc_policy_weak expectation");
	});
});

// ══════════════════════════════════════════════════
// Rule 3 — SPF absent
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — SPF absent", () => {
	test("fires high when SPF missing", () => {
		const { inferences } = runPipeline(blankPayload());
		assert(hasInference(inferences, "spf_record_absent"), "spf_record_absent expectation");
		assertEqual(inferenceByKey(inferences, "spf_record_absent")?.severity_hint, "high");
	});
	test("does NOT fire when SPF is present", () => {
		const { inferences } = runPipeline(
			blankPayload({
				spf: {
					found: true,
					raw: "v=spf1 include:_spf.google.com -all",
					include_count: 1,
					all_qualifier: "-",
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "spf_record_absent"), "spf_record_absent expectation");
	});
});

// ══════════════════════════════════════════════════
// Rule 4 — SPF too broad
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — SPF too broad", () => {
	test("fires high on +all (open relay)", () => {
		const { inferences } = runPipeline(
			blankPayload({
				spf: {
					found: true,
					raw: "v=spf1 include:_spf.google.com +all",
					include_count: 1,
					all_qualifier: "+",
					lookup_failed: false,
				},
			}),
		);
		assertEqual(
			inferenceByKey(inferences, "spf_includes_too_broad")?.severity_hint,
			"high",
		);
	});
	test("fires medium when include_count > 10", () => {
		const { inferences } = runPipeline(
			blankPayload({
				spf: {
					found: true,
					raw: "v=spf1 include:a include:b include:c include:d include:e include:f include:g include:h include:i include:j include:k -all",
					include_count: 11,
					all_qualifier: "-",
					lookup_failed: false,
				},
			}),
		);
		assertEqual(
			inferenceByKey(inferences, "spf_includes_too_broad")?.severity_hint,
			"medium",
		);
	});
	test("does NOT fire on -all with 3 includes", () => {
		const { inferences } = runPipeline(
			blankPayload({
				spf: {
					found: true,
					raw: "v=spf1 include:_spf.google.com include:sendgrid.net include:mailgun.org -all",
					include_count: 3,
					all_qualifier: "-",
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "spf_includes_too_broad"), "spf_includes_too_broad expectation");
	});
});

// ══════════════════════════════════════════════════
// Rule 5 — DKIM selector missing
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — DKIM selector missing", () => {
	test("fires when no DKIM selectors resolve", () => {
		const { inferences } = runPipeline(blankPayload());
		assert(hasInference(inferences, "dkim_selector_missing"), "dkim_selector_missing expectation");
		assertEqual(
			inferenceByKey(inferences, "dkim_selector_missing")?.severity_hint,
			"medium",
		);
	});
	test("does NOT fire when at least one selector resolved", () => {
		const { inferences } = runPipeline(
			blankPayload({
				dkim: {
					probed_selectors: ["default", "google"],
					found_selectors: ["google"],
					raw_by_selector: { google: "v=DKIM1; k=rsa; p=MIGfMA0G..." },
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "dkim_selector_missing"), "dkim_selector_missing expectation");
	});
});

// ══════════════════════════════════════════════════
// Rule 6 — BIMI unconfigured
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — BIMI unconfigured", () => {
	test("fires low when BIMI missing", () => {
		const { inferences } = runPipeline(blankPayload());
		assert(hasInference(inferences, "bimi_unconfigured"), "bimi_unconfigured expectation");
		assertEqual(inferenceByKey(inferences, "bimi_unconfigured")?.severity_hint, "low");
	});
	test("does NOT fire when BIMI is present", () => {
		const { inferences } = runPipeline(
			blankPayload({
				bimi: {
					found: true,
					raw: "v=BIMI1; l=https://havefunnels.com/.well-known/bimi-logo.svg",
					logo_url: "https://havefunnels.com/.well-known/bimi-logo.svg",
					vmc_url: null,
					lookup_failed: false,
				},
			}),
		);
		assert(!hasInference(inferences, "bimi_unconfigured"), "bimi_unconfigured expectation");
	});
});

// ══════════════════════════════════════════════════
// Integration — happy path env (all 4 records configured properly)
// ══════════════════════════════════════════════════
runSuite("Wave 23.1 — happy path", () => {
	test("env with full DMARC reject + SPF -all + DKIM + BIMI fires NO findings", () => {
		const { inferences } = runPipeline({
			type: "email_auth_record",
			apex_domain: "well-configured.com",
			dmarc: {
				found: true,
				raw: "v=DMARC1; p=reject; rua=mailto:dmarc@well-configured.com; sp=reject",
				policy: "reject",
				rua: "mailto:dmarc@well-configured.com",
				subdomain_policy: "reject",
				lookup_failed: false,
			},
			spf: {
				found: true,
				raw: "v=spf1 include:_spf.google.com -all",
				include_count: 1,
				all_qualifier: "-",
				lookup_failed: false,
			},
			dkim: {
				probed_selectors: ["google"],
				found_selectors: ["google"],
				raw_by_selector: { google: "v=DKIM1; k=rsa; p=MIGfMA0G..." },
				lookup_failed: false,
			},
			bimi: {
				found: true,
				raw: "v=BIMI1; l=https://well-configured.com/bimi.svg; a=https://well-configured.com/vmc.pem",
				logo_url: "https://well-configured.com/bimi.svg",
				vmc_url: "https://well-configured.com/vmc.pem",
				lookup_failed: false,
			},
		});
		assertEqual(inferences.length, 0, "expected 0 findings on a fully-configured env");
	});
});

// ══════════════════════════════════════════════════
// Exit code
// ══════════════════════════════════════════════════
if (suitesFailed > 0) {
	console.log(`\n❌ ${suitesFailed} suite(s) failed, ${suitesPassed} passed`);
	process.exit(1);
} else {
	console.log(`\n✅ All ${suitesPassed} suites passed`);
}
