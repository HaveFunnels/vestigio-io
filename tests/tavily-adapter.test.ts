// ──────────────────────────────────────────────
// Tavily adapter unit tests — Wave 25
//
// Covers the deterministic surface of the Tavily adapter that
// doesn't touch the network:
//   - locale → Tavily country mapping
//   - URL → host extraction
//   - factory gating on TAVILY_API_KEY presence
//   - provider preference order (Tavily > Brave when both keys set)
// ──────────────────────────────────────────────

import {
	__testing as tavilyInternals,
	tryCreateTavilyProvider,
	TavilySearchProvider,
} from "../workers/serp/tavily-search";
import { tryCreateBraveSearchProvider, BraveSearchProvider } from "../workers/serp/brave-search";
import {
	getSerpProvider,
	resetSerpProviderForTest,
} from "../workers/serp/provider";
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

// ══════════════════════════════════════════════════
// Suite 1 — Locale → country mapping
// ══════════════════════════════════════════════════
runSuite("Tavily — locale to country", () => {
	test("pt-BR → brazil", () => {
		assertEqual(tavilyInternals.localeToCountry("pt-BR"), "brazil");
	});
	test("pt-br lowercase → brazil", () => {
		assertEqual(tavilyInternals.localeToCountry("pt-br"), "brazil");
	});
	test("pt-PT → portugal", () => {
		assertEqual(tavilyInternals.localeToCountry("pt-PT"), "portugal");
	});
	test("es → spain", () => {
		assertEqual(tavilyInternals.localeToCountry("es"), "spain");
	});
	test("de → germany", () => {
		assertEqual(tavilyInternals.localeToCountry("de"), "germany");
	});
	test("en (default) → united states", () => {
		assertEqual(tavilyInternals.localeToCountry("en"), "united states");
	});
	test("undefined → united states", () => {
		assertEqual(tavilyInternals.localeToCountry(undefined), "united states");
	});
	test("unknown locale → united states", () => {
		assertEqual(tavilyInternals.localeToCountry("xx-YY"), "united states");
	});
});

// ══════════════════════════════════════════════════
// Suite 2 — Host extraction
// ══════════════════════════════════════════════════
runSuite("Tavily — host from URL", () => {
	test("strips www. prefix", () => {
		assertEqual(tavilyInternals.hostFromUrl("https://www.havefunnels.com/"), "havefunnels.com");
	});
	test("keeps non-www subdomain", () => {
		assertEqual(
			tavilyInternals.hostFromUrl("https://blog.acme.com/post"),
			"blog.acme.com",
		);
	});
	test("lowercases the host", () => {
		assertEqual(tavilyInternals.hostFromUrl("https://EXAMPLE.COM/"), "example.com");
	});
	test("handles http (not https)", () => {
		assertEqual(tavilyInternals.hostFromUrl("http://acme.com/"), "acme.com");
	});
	test("returns empty string for invalid URL", () => {
		assertEqual(tavilyInternals.hostFromUrl("not a url"), "");
	});
	test("returns empty string for undefined", () => {
		assertEqual(tavilyInternals.hostFromUrl(undefined), "");
	});
});

// ══════════════════════════════════════════════════
// Suite 3 — Factory gating
// ══════════════════════════════════════════════════
runSuite("Tavily — factory gating", () => {
	test("returns null when TAVILY_API_KEY missing", () => {
		const prev = process.env.TAVILY_API_KEY;
		delete process.env.TAVILY_API_KEY;
		try {
			const p = tryCreateTavilyProvider();
			assertEqual(p, null);
		} finally {
			if (prev) process.env.TAVILY_API_KEY = prev;
		}
	});
	test("returns provider when TAVILY_API_KEY set", () => {
		const prev = process.env.TAVILY_API_KEY;
		process.env.TAVILY_API_KEY = "tvly-test-key";
		try {
			const p = tryCreateTavilyProvider();
			assert(p !== null, "provider should be created");
			assertEqual(p?.name, "tavily");
		} finally {
			if (prev) process.env.TAVILY_API_KEY = prev;
			else delete process.env.TAVILY_API_KEY;
		}
	});
	test("returns null when key is whitespace-only", () => {
		const prev = process.env.TAVILY_API_KEY;
		process.env.TAVILY_API_KEY = "   ";
		try {
			assertEqual(tryCreateTavilyProvider(), null);
		} finally {
			if (prev) process.env.TAVILY_API_KEY = prev;
			else delete process.env.TAVILY_API_KEY;
		}
	});
});

// ══════════════════════════════════════════════════
// Suite 4 — Provider preference order
// ══════════════════════════════════════════════════
runSuite("Provider preference: Tavily > Brave", () => {
	test("returns Tavily when only Tavily key set", () => {
		const t = process.env.TAVILY_API_KEY;
		const b = process.env.BRAVE_SEARCH_API_KEY;
		process.env.TAVILY_API_KEY = "tvly-test";
		delete process.env.BRAVE_SEARCH_API_KEY;
		resetSerpProviderForTest();
		try {
			assertEqual(getSerpProvider()?.name, "tavily");
		} finally {
			if (t) process.env.TAVILY_API_KEY = t;
			else delete process.env.TAVILY_API_KEY;
			if (b) process.env.BRAVE_SEARCH_API_KEY = b;
			resetSerpProviderForTest();
		}
	});
	test("returns Brave when only Brave key set", () => {
		const t = process.env.TAVILY_API_KEY;
		const b = process.env.BRAVE_SEARCH_API_KEY;
		delete process.env.TAVILY_API_KEY;
		process.env.BRAVE_SEARCH_API_KEY = "BSA-test";
		resetSerpProviderForTest();
		try {
			assertEqual(getSerpProvider()?.name, "brave_search");
		} finally {
			if (t) process.env.TAVILY_API_KEY = t;
			if (b) process.env.BRAVE_SEARCH_API_KEY = b;
			else delete process.env.BRAVE_SEARCH_API_KEY;
			resetSerpProviderForTest();
		}
	});
	test("prefers Tavily when BOTH keys set", () => {
		const t = process.env.TAVILY_API_KEY;
		const b = process.env.BRAVE_SEARCH_API_KEY;
		process.env.TAVILY_API_KEY = "tvly-test";
		process.env.BRAVE_SEARCH_API_KEY = "BSA-test";
		resetSerpProviderForTest();
		try {
			assertEqual(getSerpProvider()?.name, "tavily");
		} finally {
			if (t) process.env.TAVILY_API_KEY = t;
			else delete process.env.TAVILY_API_KEY;
			if (b) process.env.BRAVE_SEARCH_API_KEY = b;
			else delete process.env.BRAVE_SEARCH_API_KEY;
			resetSerpProviderForTest();
		}
	});
	test("returns null when no keys set", () => {
		const t = process.env.TAVILY_API_KEY;
		const b = process.env.BRAVE_SEARCH_API_KEY;
		delete process.env.TAVILY_API_KEY;
		delete process.env.BRAVE_SEARCH_API_KEY;
		resetSerpProviderForTest();
		try {
			assertEqual(getSerpProvider(), null);
		} finally {
			if (t) process.env.TAVILY_API_KEY = t;
			if (b) process.env.BRAVE_SEARCH_API_KEY = b;
			resetSerpProviderForTest();
		}
	});
});

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════");
console.log("  TAVILY ADAPTER TEST SUMMARY");
console.log("═══════════════════════════════════════════════");
console.log(`  Suites: ${suitesPassed} passed, ${suitesFailed} failed`);
console.log("═══════════════════════════════════════════════\n");
if (suitesFailed > 0) {
	console.log(`❌ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`✅ All ${suitesPassed} suites passed`);
