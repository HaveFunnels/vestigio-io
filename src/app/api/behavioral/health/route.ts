import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { ingestCounters, bufferSize } from "@/libs/ingest-buffer";

// ──────────────────────────────────────────────
// Behavioral Pipeline Health — GET /api/behavioral/health
//
// Returns real-time counters and buffer state for the ingest pipeline.
// Admin-only. Intended for dashboards and oncall debugging.
// ──────────────────────────────────────────────

export const runtime = "nodejs";

export async function GET() {
	const user = await isAuthorized();
	if (!user || (user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

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
