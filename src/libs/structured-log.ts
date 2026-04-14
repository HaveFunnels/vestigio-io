// ──────────────────────────────────────────────
// Structured log helper  (Wave 5 Fase 1A)
//
// Thin wrapper that prefixes every line with a JSON blob of
// correlation IDs — mostly cycle_id, org_id, env_id, worker_id.
// Keeps grep-by-cycle trivial in Railway logs (`railway logs | grep
// cycle_xyz`) and makes future ingestion into Datadog/Logtail/etc a
// one-parser job.
//
// Not a logger replacement: we still use console.log/warn/error so
// existing call sites keep working; this just adds a rendered context
// prefix + the message. Deliberately minimal — zero deps, zero config.
//
// Usage:
//   const log = createLogger({ cycleId, orgId, envId });
//   log.info("pipeline started");
//   log.warn("playwright fallback", { reason: "spa_detected" });
//   log.error("persist failed", { err: e.message });
//
// Output (prod):
//   {"level":"info","ts":"2026-04-14T...","cycle_id":"c_x","org_id":"o_y","msg":"pipeline started"}
// ──────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
	cycleId?: string;
	orgId?: string;
	envId?: string;
	workerId?: string;
	priority?: string;
	attempt?: number;
	// Free-form extra identifiers. Kept separate from the top-level
	// context so call sites can override/merge without accidentally
	// stomping each other's keys.
	[key: string]: unknown;
}

interface Logger {
	info(msg: string, extra?: Record<string, unknown>): void;
	warn(msg: string, extra?: Record<string, unknown>): void;
	error(msg: string, extra?: Record<string, unknown>): void;
	debug(msg: string, extra?: Record<string, unknown>): void;
	/** Derive a child logger with additional context merged in. */
	child(extra: LogContext): Logger;
}

function emit(
	level: LogLevel,
	context: LogContext,
	msg: string,
	extra?: Record<string, unknown>,
) {
	// Rendered line stays valid JSON so log aggregators (or `jq`) can
	// parse it directly. Keys use snake_case because that's the common
	// convention in most log ingestion pipelines; the source code uses
	// camelCase but the transform is trivial and happens only here.
	const line: Record<string, unknown> = {
		level,
		ts: new Date().toISOString(),
		msg,
	};
	for (const [k, v] of Object.entries(context)) {
		if (v === undefined || v === null) continue;
		// camelCase → snake_case: cycleId → cycle_id, etc.
		const snake = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
		line[snake] = v;
	}
	if (extra) {
		for (const [k, v] of Object.entries(extra)) {
			if (v === undefined) continue;
			const snake = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
			line[snake] = v;
		}
	}
	const serialized = JSON.stringify(line);
	if (level === "error") {
		console.error(serialized);
	} else if (level === "warn") {
		console.warn(serialized);
	} else if (level === "debug") {
		console.debug(serialized);
	} else {
		console.log(serialized);
	}
}

export function createLogger(context: LogContext = {}): Logger {
	return {
		info: (msg, extra) => emit("info", context, msg, extra),
		warn: (msg, extra) => emit("warn", context, msg, extra),
		error: (msg, extra) => emit("error", context, msg, extra),
		debug: (msg, extra) => emit("debug", context, msg, extra),
		child: (extra) => createLogger({ ...context, ...extra }),
	};
}

/**
 * Generate a stable-ish worker id for log correlation. Derived from
 * PID + a short hex suffix so the same process always logs with the
 * same id across restarts (within a process). Called once per worker
 * boot.
 */
export function generateWorkerId(): string {
	const suffix = Math.random().toString(16).slice(2, 8);
	return `w_${process.pid}_${suffix}`;
}
