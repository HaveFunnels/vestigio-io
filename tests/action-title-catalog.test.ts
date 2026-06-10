/**
 * Coverage + verb-led tests for packages/decision/action-title-catalog.ts
 *
 * Run: npx tsx tests/action-title-catalog.test.ts
 *
 * These tests are the safety net for Path 3 — "fix engine to emit
 * verb-led action titles". Two assertions:
 *
 *  1. Every (PackKey × ActionTier × CatalogLocale) has a non-empty
 *     string. The module-load assertion already catches this at boot,
 *     but the test exists so CI / contributors get a clear failure
 *     in PRs that add a new pack/tier/locale.
 *
 *  2. Every title starts with an imperative verb in its locale. This
 *     is the architectural property the user requested — the engine
 *     emits "what to do", never "what's wrong restated".
 */

import { listMissingPackPrimaries, listNonVerbLedTitles } from "../packages/decision/action-title-catalog";

let suitesPassed = 0;
let suitesFailed = 0;

function describe(name: string, fn: () => void) {
	console.log(`\n${name}`);
	try {
		fn();
		suitesPassed++;
	} catch (err) {
		suitesFailed++;
		console.error(`  ✗ ${(err as Error).message}`);
	}
}

function it(name: string, fn: () => void) {
	try {
		fn();
		console.log(`  ✓ ${name}`);
	} catch (err) {
		console.log(`  ✗ ${name}`);
		throw err;
	}
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
	if (actual !== expected) {
		throw new Error(msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

describe("action-title-catalog — coverage", () => {
	it("every (pack × tier × locale) is registered with a non-empty string", () => {
		const missing = listMissingPackPrimaries();
		if (missing.length > 0) {
			throw new Error(
				`Missing ${missing.length} entries:\n  - ${missing.join("\n  - ")}`,
			);
		}
		assertEqual(missing.length, 0);
	});
});

describe("action-title-catalog — verb-led", () => {
	it("every title starts with an imperative verb in its locale", () => {
		const offenders = listNonVerbLedTitles();
		if (offenders.length > 0) {
			throw new Error(
				`${offenders.length} titles are not verb-led:\n  - ${offenders.join("\n  - ")}\n\n` +
					"Each title must begin with a verb (e.g. 'Stop', 'Fix', 'Refine', " +
					"'Maintain'). Add the verb to the IMPERATIVE_VERBS list in the " +
					"catalog file if it's a legitimate new verb.",
			);
		}
		assertEqual(offenders.length, 0);
	});
});

console.log("\n═══════════════════════════════════════════════");
console.log("  action-title-catalog SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
	console.log("  FAILED");
	process.exit(1);
} else {
	console.log("  ALL PASSED");
}
console.log("═══════════════════════════════════════════════");
