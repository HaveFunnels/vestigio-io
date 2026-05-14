/**
 * recompute-worker.ts — Node worker_threads entry point.
 *
 * Runs `recomputeAllAsync` on its own V8 isolate so the audit-runner
 * main thread keeps its event loop free for queue polling, healthcheck,
 * heal cron, and the second concurrent cycle slot. Each spawned thread
 * is reusable across cycles; the parent pool decides when to retire it.
 *
 * The work this file does is intentionally tiny: receive an input
 * envelope, run the engine, post the result back. The pool handles
 * lifecycle (spawning, queueing, error recovery, shutdown).
 *
 * Required by `recompute-pool.ts`. Not meant to be imported by any
 * other module.
 */

import { parentPort } from "node:worker_threads";
import type { MultiPackInput, MultiPackResult } from "../../packages/workspace";
import { recomputeAllAsync } from "../../packages/workspace";

if (!parentPort) {
	throw new Error(
		"recompute-worker.ts must be loaded as a worker thread (parentPort is null).",
	);
}

interface JobRequest {
	id: number;
	input: MultiPackInput;
}

type JobResponse =
	| { id: number; ok: true; result: MultiPackResult }
	| { id: number; ok: false; error: string };

parentPort.on("message", async (msg: JobRequest) => {
	try {
		const result = await recomputeAllAsync(msg.input);
		const response: JobResponse = { id: msg.id, ok: true, result };
		parentPort!.postMessage(response);
	} catch (err) {
		const response: JobResponse = {
			id: msg.id,
			ok: false,
			error: err instanceof Error ? err.stack || err.message : String(err),
		};
		parentPort!.postMessage(response);
	}
});
