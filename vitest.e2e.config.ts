import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts on purpose.
//
// These tests drive a real browser against a DEPLOYED url, so they are
// slow, need network, and must never run as part of the unit suite.
// They also cover a class of failure the unit suite structurally
// cannot: every acquisition outage this product has had came from
// deploy-time configuration — a Dockerfile missing ARG lines, a CSP
// without the captcha host, a form that never sent a token. The build
// was green for all three.
export default defineConfig({
	// Same alias as the unit config, so a contract test can import the
	// real resolver instead of re-implementing it.
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["e2e/**/*.e2e.test.ts"],
		environment: "node",
		testTimeout: 120_000,
		hookTimeout: 120_000,
		// One browser, one page, sequential. Parallel runs against
		// production would race on the shared Turnstile challenge.
		fileParallelism: false,
		retry: 1,
	},
});
