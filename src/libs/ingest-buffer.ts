// ──────────────────────────────────────────────
// Async Ingest Buffer
//
// Decouples the HTTP response from the Prisma write so a slow DB
// doesn't block customer-facing snippet flushes. Events accumulate
// in an in-memory queue and are flushed to RawBehavioralEvent in
// periodic micro-batches.
//
// Trade-off: events that haven't been flushed yet are lost on
// hard crashes. This is acceptable for behavioral analytics (they
// are statistical, not transactional) and far better than the
// alternative of blocking every ingest POST on a full DB roundtrip.
//
// Tuning knobs (constants below):
//   FLUSH_INTERVAL_MS — how often the drain loop fires
//   MAX_BUFFER_SIZE   — hard cap; oldest events are dropped when full
//   MAX_RETRIES       — per-batch retry count before giving up
// ──────────────────────────────────────────────

import { prisma } from "./prismaDb";

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER_SIZE = 10_000;
const MAX_RETRIES = 3;

interface PendingRow {
	envId: string;
	sessionId: string;
	eventType: string;
	url: string;
	occurredAt: Date;
	payload: string;
	attribution: string | null;
	ipHash: string | null;
	userAgent: string | null;
}

let buffer: PendingRow[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

// Counters for observability (exported so the metrics module can read them)
export const ingestCounters = {
	enqueued: 0,
	flushed: 0,
	dropped: 0,
	flushErrors: 0,
};

export function enqueue(rows: PendingRow[]): void {
	// If the buffer is full, drop the oldest events to make room.
	// Dropping is better than rejecting (the HTTP response already
	// returned 204; there's nothing to signal back to the client).
	const overflow = buffer.length + rows.length - MAX_BUFFER_SIZE;
	if (overflow > 0) {
		buffer.splice(0, overflow);
		ingestCounters.dropped += overflow;
	}
	buffer.push(...rows);
	ingestCounters.enqueued += rows.length;
	ensureTimer();
}

export function bufferSize(): number {
	return buffer.length;
}

async function flush(): Promise<void> {
	if (flushing || buffer.length === 0) return;
	flushing = true;

	// Drain the current buffer atomically (swap reference).
	const batch = buffer;
	buffer = [];

	let attempt = 0;
	while (attempt < MAX_RETRIES) {
		try {
			await prisma.rawBehavioralEvent.createMany({
				data: batch,
				skipDuplicates: true,
			});
			ingestCounters.flushed += batch.length;
			flushing = false;
			return;
		} catch (err) {
			attempt++;
			ingestCounters.flushErrors++;
			if (attempt >= MAX_RETRIES) {
				console.error(
					JSON.stringify({
						level: "error",
						component: "ingest-buffer",
						event: "flush_failed",
						attempts: MAX_RETRIES,
						dropped: batch.length,
						total_dropped: ingestCounters.dropped + batch.length,
						error: err instanceof Error ? err.message : String(err),
					}),
				);
				ingestCounters.dropped += batch.length;
			} else {
				// Exponential backoff with jitter to prevent retry storms
				const base = 200 * Math.pow(2, attempt - 1);
				const jitter = Math.random() * base;
				await new Promise((r) => setTimeout(r, base + jitter));
			}
		}
	}

	flushing = false;
}

function ensureTimer(): void {
	if (flushTimer) return;
	flushTimer = setInterval(() => {
		flush().catch(() => {});
	}, FLUSH_INTERVAL_MS);

	// Allow Node to exit even with the timer running.
	if (flushTimer && typeof flushTimer === "object" && "unref" in flushTimer) {
		flushTimer.unref();
	}
}

// Graceful shutdown: try to flush remaining events on SIGTERM.
if (typeof process !== "undefined") {
	const shutdown = () => {
		if (flushTimer) clearInterval(flushTimer);
		flush().catch(() => {});
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}
