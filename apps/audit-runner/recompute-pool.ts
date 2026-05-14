/**
 * recompute-pool.ts — Worker-thread pool for the engine's heavy CPU
 * phase.
 *
 * Why: `recomputeAllAsync` is pure CPU. With `AUDIT_WORKER_CONCURRENCY=2`
 * two cycles run on the same Node process and share its single V8
 * isolate / event loop, so their recomputes serialize even though we
 * have generator yields. Moving each recompute onto its own worker
 * thread gives them their own V8 isolate → real CPU parallelism on
 * multi-core hosts, and frees the main thread to handle queue polling,
 * Redis heartbeats, healthcheck, heal cron, SIGTERM handling, etc.
 *
 * Cost: ~50-100MB resident per warm thread (one V8 isolate + workspace
 * module graph). Pool defaults to `AUDIT_WORKER_CONCURRENCY` threads
 * since that's how many concurrent cycles a single audit-worker can
 * run, but it's env-tunable separately via `RECOMPUTE_POOL_SIZE`.
 *
 * Threads are reusable across cycles — we don't spawn-per-cycle, which
 * would amortize 100-200ms of cold-start across every audit. Crashed
 * threads are detected (error/exit events) and the pending job is
 * rejected; the pool spawns a replacement on the next request.
 *
 * Required runtime: tsx (the audit-runner entry is `tsx
 * apps/audit-runner/worker-loop.ts`). tsx 4+ propagates its ESM loader
 * into worker_threads automatically, so `new Worker("./*.ts")` works
 * without any explicit `execArgv` plumbing.
 *
 * Off by default — set `RECOMPUTE_USE_WORKER_THREADS=1` to enable. Lets
 * us roll this out gradually and roll back instantly without a deploy.
 */

import { Worker } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
	MultiPackInput,
	MultiPackResult,
} from "../../packages/workspace";

interface PendingJob {
	id: number;
	resolve: (result: MultiPackResult) => void;
	reject: (err: Error) => void;
}

interface QueuedRequest {
	input: MultiPackInput;
	resolve: (result: MultiPackResult) => void;
	reject: (err: Error) => void;
}

const POOL_SIZE = Math.max(
	1,
	Number(
		process.env.RECOMPUTE_POOL_SIZE ||
			process.env.AUDIT_WORKER_CONCURRENCY ||
			"2",
	),
);

// Worker-bundle build: synchronously bundle recompute-worker.ts + its
// dependency tree into a single .mjs file in os.tmpdir(). Synchronous
// because this runs once per process at first spawn; bundling ~1MB of
// engine code with esbuild takes ~100-200ms. Cached afterwards.
let _bundlePath: string | null = null;
function getOrBuildWorkerBundle(): string {
	if (_bundlePath) return _bundlePath;
	const entry = path.resolve(__dirname, "recompute-worker.ts");
	// One bundle per Node process so concurrent spawns don't race on
	// the same temp file. The PID suffix is unique per worker-loop
	// process — replicas in Railway each have their own bundle.
	const out = path.join(os.tmpdir(), `vestigio-recompute-worker-${process.pid}.mjs`);
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const esbuild = require("esbuild") as typeof import("esbuild");
	esbuild.buildSync({
		entryPoints: [entry],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile: out,
		target: "node20",
		// Mark workspace internals as bundled (default behaviour).
		// Externalize Node built-ins so esbuild doesn't try to bundle
		// `node:worker_threads`, etc.
		packages: "external",
		// Source maps would explode the bundle and the worker has no
		// observability surface that consumes them today.
		sourcemap: false,
		logLevel: "silent",
	});
	_bundlePath = out;
	return out;
}

class RecomputePool {
	private workers: Worker[] = [];
	private idleWorkers: Worker[] = [];
	private pendingByWorker = new Map<Worker, PendingJob>();
	private waitQueue: QueuedRequest[] = [];
	private nextJobId = 0;

	private spawnWorker(): Worker {
		// tsx's ESM loader doesn't propagate into worker_threads on
		// recent Node releases, and Node's native --experimental-strip-types
		// doesn't auto-resolve TS extensions or directory imports across
		// our packages. So we bundle the worker entry + its full
		// dependency graph into a single .mjs file via esbuild (the
		// bundler tsx already uses internally) on first spawn, then
		// point the Worker at the bundle. Cached on disk so subsequent
		// spawns are instant.
		const bundlePath = getOrBuildWorkerBundle();
		const w = new Worker(bundlePath);
		w.on("message", (msg: unknown) => this.onMessage(w, msg));
		w.on("error", (err) => this.onError(w, err));
		w.on("exit", (code) => this.onExit(w, code));
		this.workers.push(w);
		return w;
	}

	private onMessage(w: Worker, msg: unknown): void {
		const m = msg as { id: number; ok: boolean; result?: MultiPackResult; error?: string };
		const pending = this.pendingByWorker.get(w);
		if (!pending || pending.id !== m.id) return; // stale or mismatched
		this.pendingByWorker.delete(w);
		if (m.ok && m.result) {
			pending.resolve(m.result);
		} else {
			pending.reject(new Error(m.error || "Unknown worker error"));
		}
		this.markIdle(w);
	}

	private onError(w: Worker, err: Error): void {
		const pending = this.pendingByWorker.get(w);
		if (pending) {
			this.pendingByWorker.delete(w);
			pending.reject(err);
		}
		this.removeWorker(w);
	}

	private onExit(w: Worker, _code: number): void {
		const pending = this.pendingByWorker.get(w);
		if (pending) {
			this.pendingByWorker.delete(w);
			pending.reject(new Error("Recompute worker thread exited unexpectedly"));
		}
		this.removeWorker(w);
	}

	private removeWorker(w: Worker): void {
		this.workers = this.workers.filter((x) => x !== w);
		this.idleWorkers = this.idleWorkers.filter((x) => x !== w);
	}

	private markIdle(w: Worker): void {
		// Only mark idle if the worker is still in the pool (could have
		// been removed by a parallel error/exit handler).
		if (!this.workers.includes(w)) return;
		this.idleWorkers.push(w);
		this.tryDrainQueue();
	}

	private tryDrainQueue(): void {
		while (this.idleWorkers.length > 0 && this.waitQueue.length > 0) {
			const w = this.idleWorkers.shift()!;
			const next = this.waitQueue.shift()!;
			this.dispatch(w, next.input, next.resolve, next.reject);
		}
	}

	private dispatch(
		w: Worker,
		input: MultiPackInput,
		resolve: (result: MultiPackResult) => void,
		reject: (err: Error) => void,
	): void {
		const id = ++this.nextJobId;
		this.pendingByWorker.set(w, { id, resolve, reject });
		w.postMessage({ id, input });
	}

	run(input: MultiPackInput): Promise<MultiPackResult> {
		return new Promise<MultiPackResult>((resolve, reject) => {
			// Try idle worker first (warm reuse).
			const idle = this.idleWorkers.shift();
			if (idle) {
				this.dispatch(idle, input, resolve, reject);
				return;
			}
			// Otherwise spawn if under cap.
			if (this.workers.length < POOL_SIZE) {
				const w = this.spawnWorker();
				this.dispatch(w, input, resolve, reject);
				return;
			}
			// Cap hit — queue and wait for an idle slot.
			this.waitQueue.push({ input, resolve, reject });
		});
	}

	async shutdown(): Promise<void> {
		const all = [...this.workers];
		this.workers = [];
		this.idleWorkers = [];
		await Promise.all(
			all.map((w) =>
				w.terminate().catch(() => {
					// best-effort
				}),
			),
		);
	}

	stats(): { total: number; idle: number; busy: number; queued: number } {
		return {
			total: this.workers.length,
			idle: this.idleWorkers.length,
			busy: this.pendingByWorker.size,
			queued: this.waitQueue.length,
		};
	}
}

let _pool: RecomputePool | null = null;
function getPool(): RecomputePool {
	if (!_pool) _pool = new RecomputePool();
	return _pool;
}

/**
 * Offloaded recompute. Drop-in for `recomputeAllAsync` from the
 * audit-runner's POV — same input shape, same return shape. Routes to
 * an idle worker thread (or spawns a new one up to POOL_SIZE) and
 * awaits the result.
 *
 * Behind a runtime flag so we can ship/roll back without redeploying:
 *   - `RECOMPUTE_USE_WORKER_THREADS=1`: offload to thread pool.
 *   - default                          : fall back to in-process
 *                                         recomputeAllAsync.
 */
export async function recomputeWithPool(
	input: MultiPackInput,
): Promise<MultiPackResult> {
	if (process.env.RECOMPUTE_USE_WORKER_THREADS !== "1") {
		// Lazy import to avoid pulling the engine into the same Node
		// context when the flag is off and we'd never use it.
		const { recomputeAllAsync } = await import("../../packages/workspace");
		return await recomputeAllAsync(input);
	}
	return await getPool().run(input);
}

export function getRecomputePoolStats(): {
	total: number;
	idle: number;
	busy: number;
	queued: number;
} | null {
	if (!_pool) return null;
	return _pool.stats();
}

export async function shutdownRecomputePool(): Promise<void> {
	if (_pool) {
		await _pool.shutdown();
		_pool = null;
	}
}
