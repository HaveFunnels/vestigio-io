import { NextResponse } from "next/server";
import { requireAdmin } from "@/libs/require-admin";
import { ingestCounters, bufferSize } from "@/libs/ingest-buffer";

// ──────────────────────────────────────────────
// Behavioral Pipeline Health — GET /api/behavioral/health
//
// Returns real-time counters and buffer state for the ingest pipeline.
// Admin-only. Intended for dashboards and oncall debugging.
// ──────────────────────────────────────────────

export const runtime = "nodejs";

export async function GET() {
	const gate = await requireAdmin();
	if (gate.denied) return gate.denied;

	return NextResponse.json({
		buffer_size: bufferSize(),
		counters: {
			enqueued: ingestCounters.enqueued,
			flushed: ingestCounters.flushed,
			dropped: ingestCounters.dropped,
			flush_errors: ingestCounters.flushErrors,
		},
		uptime_seconds: Math.round(process.uptime()),
	});
}
