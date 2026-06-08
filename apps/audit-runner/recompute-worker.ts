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
		// Phase 4 follow-up — rebuild the surface_resolver from raw
		// declarations carried on the input. The pool strips the
		// function-bearing resolver before postMessage (structured
		// clone refuses functions); declarations are plain data and
		// survive the boundary. Without this rebuild, the worker
		// would fall back to the URL-substring heuristic — correct
		// behavior, but a quiet accuracy regression for envs with
		// custom Surface rows.
		let input = msg.input;
		if (input.surface_declarations && input.surface_declarations.length > 0 && !input.surface_resolver) {
			const { buildSurfaceResolver } = await import("../../packages/surfaces");
			input = {
				...input,
				surface_resolver: buildSurfaceResolver(
					input.surface_declarations as any,
				) as any,
			};
		}
		const result = await recomputeAllAsync(input);
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
