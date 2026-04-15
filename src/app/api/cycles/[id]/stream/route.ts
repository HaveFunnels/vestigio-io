import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/cycles/[id]/stream  (Wave 5 Fase 2)
//
// Server-Sent Events observer for an in-flight AuditCycle. Unlike
// /api/analysis/stream (which RUNS a pipeline and streams its events),
// this endpoint is purely a watcher — it polls the cycle row + finding
// counts every 2s and emits deltas until status flips to complete/
// failed, then closes.
//
// Used by the progress banner that appears on /app/inventory,
// /app/analysis, and /app/actions after the owner activates their
// environment. The actual crawl runs fire-and-forget via
// apps/audit-runner/run-cycle.ts from /api/environments/activate; this
// stream only surfaces progress to the UI.
//
// Event types:
//   event: status       → { status, cycleType, pagesDiscovered, findingsCount, durationMs }
//   event: complete     → { status: "complete" | "failed", cycleId }
//   event: error        → { message }  (transient — followed by close)
//
// Heartbeat: a `:heartbeat` comment every 15s keeps proxies from
// killing idle SSE connections.
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;
// Guardrail: even a cold-start cycle should finish well under 10 minutes.
// If it hasn't emitted `complete` by then we close anyway so the client
// isn't stuck — the heal cron will fail the cycle on its side.
const MAX_STREAM_DURATION_MS = 10 * 60 * 1000;

interface CycleSnapshot {
	status: string;
	cycleType: string;
	pagesDiscovered: number;
	findingsCount: number;
	durationMs: number;
}

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id: cycleId } = await context.params;
	if (!cycleId) {
		return NextResponse.json(
			{ message: "cycleId param required" },
			{ status: 400 },
		);
	}

	// Validate ownership: caller must be a member of the cycle's org.
	// Prevents a cycle id being used to watch another tenant's progress.
	const cycle = await prisma.auditCycle.findUnique({
		where: { id: cycleId },
		select: { id: true, organizationId: true },
	});
	if (!cycle) {
		return NextResponse.json(
			{ message: "Cycle not found" },
			{ status: 404 },
		);
	}

	const membership = await prisma.membership.findFirst({
		where: {
			userId: user.id,
			organizationId: cycle.organizationId,
		},
		select: { id: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const encoder = new TextEncoder();

	async function snapshot(): Promise<CycleSnapshot | null> {
		const row = await prisma.auditCycle.findUnique({
			where: { id: cycleId },
			select: {
				status: true,
				cycleType: true,
				createdAt: true,
				completedAt: true,
			},
		});
		if (!row) return null;

		// Finding count: everything persisted so far for this cycle. Used
		// both as a progress indicator (climbs during the run) and as the
		// final tally on `complete`.
		const findingsCount = await prisma.finding.count({
			where: { cycleId },
		});

		// Pages discovered: counted from PageInventoryItem rows created
		// during this cycle via the worker. Graceful fallback to 0 if the
		// item table doesn't yet have a cycleId linkage for this row (the
		// worker currently links by environmentId, so we approximate via
		// the environment's latest count — good enough for a progress UI).
		let pagesDiscovered = 0;
		try {
			const envId = (
				await prisma.auditCycle.findUnique({
					where: { id: cycleId },
					select: { environmentId: true },
				})
			)?.environmentId;
			if (envId) {
				// PageInventoryItem carries `environmentRef` (plain string column
				// set to the env's id) — not a Prisma relation via environmentId.
				pagesDiscovered = await prisma.pageInventoryItem.count({
					where: { environmentRef: envId },
				});
			}
		} catch {
			// defensive — progress bar still works with pagesDiscovered=0
		}

		const durationMs =
			(row.completedAt?.getTime() ?? Date.now()) - row.createdAt.getTime();

		return {
			status: row.status,
			cycleType: row.cycleType,
			pagesDiscovered,
			findingsCount,
			durationMs,
		};
	}

	const stream = new ReadableStream({
		async start(controller) {
			const startTime = Date.now();
			let eventId = 0;
			let lastSerialized = "";
			let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
			let pollTimer: ReturnType<typeof setTimeout> | null = null;
			let closed = false;

			function close() {
				if (closed) return;
				closed = true;
				if (heartbeatTimer) clearInterval(heartbeatTimer);
				if (pollTimer) clearTimeout(pollTimer);
				try {
					controller.close();
				} catch {
					// already closed
				}
			}

			function send(event: string, data: unknown) {
				if (closed) return;
				eventId += 1;
				const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
				try {
					controller.enqueue(encoder.encode(payload));
				} catch {
					close();
				}
			}

			// Send an initial snapshot immediately so the UI paints without
			// waiting a full poll interval.
			const initial = await snapshot();
			if (!initial) {
				send("error", { message: "Cycle not found" });
				close();
				return;
			}
			lastSerialized = JSON.stringify(initial);
			send("status", initial);
			if (initial.status === "complete" || initial.status === "failed") {
				send("complete", { status: initial.status, cycleId });
				close();
				return;
			}

			heartbeatTimer = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`:heartbeat\n\n`));
				} catch {
					close();
				}
			}, HEARTBEAT_INTERVAL_MS);

			async function tick() {
				if (closed) return;
				const elapsed = Date.now() - startTime;
				if (elapsed > MAX_STREAM_DURATION_MS) {
					send("error", { message: "Stream timed out" });
					close();
					return;
				}
				try {
					const snap = await snapshot();
					if (!snap) {
						send("error", { message: "Cycle disappeared" });
						close();
						return;
					}
					const serialized = JSON.stringify(snap);
					if (serialized !== lastSerialized) {
						lastSerialized = serialized;
						send("status", snap);
					}
					if (snap.status === "complete" || snap.status === "failed") {
						send("complete", { status: snap.status, cycleId });
						close();
						return;
					}
				} catch (err: any) {
					send("error", { message: err?.message || "Poll failed" });
				}
				if (!closed) {
					pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
				}
			}

			pollTimer = setTimeout(tick, POLL_INTERVAL_MS);

			// If the client disconnects, abort and close.
			request.signal?.addEventListener("abort", close);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
