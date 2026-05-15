/**
 * Custom OpenTelemetry metrics — registered once at worker boot.
 *
 * Two families today:
 *
 *   1. `vestigio.queue.depth{tier}`     — Redis audit queue depth per
 *                                          priority tier (hot/warm/cold/dlq).
 *                                          Async gauge polled every 30s.
 *   2. `vestigio.recompute.pool.*`      — Recompute worker-thread pool
 *                                          counts: total/idle/busy/queued.
 *                                          Async gauges polled every 30s.
 *
 * Why async gauges (a.k.a. ObservableGauge): the SDK invokes our
 * callback at export time (every 30s by default). No timer of our own,
 * no risk of dangling intervals on shutdown.
 *
 * Registration is idempotent so the worker boot path can call it
 * unconditionally.
 */

import { metrics, type ObservableResult } from "@opentelemetry/api";

let _registered = false;

export function registerCustomMetrics(): void {
	if (_registered) return;
	_registered = true;

	const meter = metrics.getMeter("vestigio.platform", "1.0.0");

	// ── Queue depth gauges ──────────────────────────────────
	// Read directly from Redis at export time. Best-effort: a Redis
	// hiccup means no sample for that tick, not a crashed callback.
	const queueGauge = meter.createObservableGauge("vestigio.queue.depth", {
		description:
			"Number of audit cycles waiting in the Redis priority queue, partitioned by tier.",
		unit: "{cycle}",
	});

	queueGauge.addCallback(async (result: ObservableResult) => {
		try {
			const { getQueueDepth } = await import(
				"../../apps/platform/audit-cycle-queue"
			);
			const depth = await getQueueDepth();
			result.observe(depth.hot, { tier: "hot" });
			result.observe(depth.warm, { tier: "warm" });
			result.observe(depth.cold, { tier: "cold" });
			result.observe(depth.dlq, { tier: "dlq" });
		} catch {
			// Skip this tick if Redis is unavailable; the gauge tolerates
			// gaps and Grafana will just show no datapoint for the window.
		}
	});

	// ── Recompute pool gauges ───────────────────────────────
	// Only meaningful when RECOMPUTE_USE_WORKER_THREADS=1; the helper
	// returns null when the pool was never instantiated, in which case
	// we publish zeros so dashboards don't break.
	const poolTotalGauge = meter.createObservableGauge(
		"vestigio.recompute.pool.total",
		{
			description: "Total worker_threads spawned by the recompute pool.",
			unit: "{thread}",
		},
	);
	const poolIdleGauge = meter.createObservableGauge(
		"vestigio.recompute.pool.idle",
		{
			description: "Worker_threads currently idle (warm, awaiting work).",
			unit: "{thread}",
		},
	);
	const poolBusyGauge = meter.createObservableGauge(
		"vestigio.recompute.pool.busy",
		{
			description: "Worker_threads currently processing a recompute.",
			unit: "{thread}",
		},
	);
	const poolQueuedGauge = meter.createObservableGauge(
		"vestigio.recompute.pool.queued",
		{
			description:
				"Cycle requests waiting for a free worker_thread (pool fully busy).",
			unit: "{request}",
		},
	);

	const observePool = async (which: "total" | "idle" | "busy" | "queued") => {
		try {
			const { getRecomputePoolStats } = await import(
				"../../apps/audit-runner/recompute-pool"
			);
			const s = getRecomputePoolStats();
			return s ? s[which] : 0;
		} catch {
			return 0;
		}
	};

	poolTotalGauge.addCallback(async (r) => r.observe(await observePool("total")));
	poolIdleGauge.addCallback(async (r) => r.observe(await observePool("idle")));
	poolBusyGauge.addCallback(async (r) => r.observe(await observePool("busy")));
	poolQueuedGauge.addCallback(async (r) =>
		r.observe(await observePool("queued")),
	);

	// ── Chromium pool gauges ────────────────────────────────
	const chromiumInUseGauge = meter.createObservableGauge(
		"vestigio.chromium.pool.in_use",
		{
			description: "Chromium browser slots currently held by a cycle.",
			unit: "{slot}",
		},
	);
	const chromiumIdleGauge = meter.createObservableGauge(
		"vestigio.chromium.pool.idle_browsers",
		{
			description: "Warm Chromium processes idle in the pool.",
			unit: "{browser}",
		},
	);

	chromiumInUseGauge.addCallback(async (r) => {
		try {
			const { getPoolStats } = await import(
				"../../workers/verification/chromium-pool"
			);
			r.observe(getPoolStats().inUse);
		} catch {
			r.observe(0);
		}
	});
	chromiumIdleGauge.addCallback(async (r) => {
		try {
			const { getPoolStats } = await import(
				"../../workers/verification/chromium-pool"
			);
			r.observe(getPoolStats().idleBrowsers);
		} catch {
			r.observe(0);
		}
	});

	console.log(
		"[otel-metrics] registered queue depth + recompute pool + chromium pool gauges",
	);
}
