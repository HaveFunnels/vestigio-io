/* eslint-disable */
// Smoke test: run recomputeWithPool with the flag both off and on, and
// confirm the two paths produce structurally identical output. Also
// times each path so we can spot regressions.
//
// Run:
//   npx tsx scripts/test-recompute-pool.ts

import { recomputeWithPool, shutdownRecomputePool } from "../apps/audit-runner/recompute-pool";
import { recomputeAllAsync } from "../packages/workspace";

const input: any = {
	evidence: [],
	scoping: {
		workspace_ref: "ws_test",
		environment_ref: "env_test",
		subject_ref: "website:test.com",
		path_scope: null,
	},
	cycle_ref: "audit_cycle:test",
	root_domain: "test.com",
	landing_url: "https://test.com/",
	conversion_proximity: 2,
	is_production: true,
};

function summarize(r: any) {
	return {
		keys: Object.keys(r).sort().join(","),
		signals: r.signals?.length ?? 0,
		inferences: r.inferences?.length ?? 0,
		decisions: [
			r.scale_readiness?.decision?.decision_key,
			r.revenue_integrity?.decision?.decision_key,
		].filter(Boolean).join(","),
	};
}

(async () => {
	// In-process path
	delete process.env.RECOMPUTE_USE_WORKER_THREADS;
	const t1 = Date.now();
	const inproc = await recomputeAllAsync(input);
	const t1d = Date.now() - t1;
	console.log(`IN_PROC ${t1d}ms`, summarize(inproc));

	// Worker-thread path
	process.env.RECOMPUTE_USE_WORKER_THREADS = "1";
	const t2 = Date.now();
	const offloaded = await recomputeWithPool(input);
	const t2d = Date.now() - t2;
	console.log(`OFFLOADED ${t2d}ms`, summarize(offloaded));

	// Second call should be faster (warm thread)
	const t3 = Date.now();
	const offloaded2 = await recomputeWithPool(input);
	const t3d = Date.now() - t3;
	console.log(`OFFLOADED_WARM ${t3d}ms`, summarize(offloaded2));

	const inSig = summarize(inproc);
	const outSig = summarize(offloaded);
	const okSignals = inSig.signals === outSig.signals;
	const okInferences = inSig.inferences === outSig.inferences;
	const okKeys = inSig.keys === outSig.keys;

	if (!okSignals || !okInferences || !okKeys) {
		console.error("MISMATCH between in-proc and offloaded paths");
		process.exit(1);
	}
	console.log("OK — both paths produced identical output shape + counts");
	await shutdownRecomputePool();
	process.exit(0);
})();
