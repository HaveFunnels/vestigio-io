/**
 * Anchored same-site boundary.
 *
 * Every crawl-scope gate (hreflang alternates, manual seeds,
 * pixel-discovered behavioral seeds, pagination links) routes through
 * isSameDomain. Four of those call sites used a bare
 * `host.endsWith(rootDomain)`, which accepts any domain that merely
 * ENDS with the root string -- `evilcasamontelle.com` passes for root
 * `casamontelle.com`.
 *
 * That matters most on the behavioral-seed path: landing_url arrives
 * from the browser via a public beacon endpoint, so anyone able to
 * post a beacon could have steered the crawler at a host they control
 * and had the fetched content ingested as the customer's own evidence.
 *
 * Run: npx tsx tests/same-domain-anchor.test.ts
 */

import { test, assert, printResults, resetCounters } from "./helpers";
import { isSameDomain } from "../workers/ingestion/parser";

function main() {
	resetCounters();
	const root = "casamontelle.com";

	test("accepts the apex domain", () => {
		assert(isSameDomain("casamontelle.com", root), "apex should match");
	});

	test("accepts real subdomains", () => {
		assert(isSameDomain("seguro.casamontelle.com", root), "checkout subdomain should match");
		assert(isSameDomain("a.b.casamontelle.com", root), "nested subdomain should match");
	});

	test("rejects suffix-collision domains (the bypass)", () => {
		for (const evil of [
			"evilcasamontelle.com",
			"notcasamontelle.com",
			"xcasamontelle.com",
			"casamontelle.com.attacker.net",
		]) {
			assert(!isSameDomain(evil, root), `${evil} must not pass the same-site gate`);
		}
	});

	test("normalizes case and the FQDN trailing dot", () => {
		assert(isSameDomain("CasaMontelle.COM", root), "uppercase host should match");
		assert(isSameDomain("casamontelle.com.", root), "trailing-dot FQDN should match");
		assert(
			!isSameDomain("evilcasamontelle.com.", root),
			"trailing dot must not reopen the bypass",
		);
	});

	test("rejects empty inputs", () => {
		assert(!isSameDomain("", root), "empty host");
		assert(!isSameDomain("casamontelle.com", ""), "empty root");
	});

	printResults("Same-domain anchor");
}

main();
