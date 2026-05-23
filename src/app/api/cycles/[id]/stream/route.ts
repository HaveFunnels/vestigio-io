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
// Wave 22 Fase B+ — bumped from 10min to 90min. The previous 10min cap
// silently closed the SSE stream on any audit longer than that, which on
// enterprise-scale customers (Itaú-class) is the COMMON case. We now
// trust two safety layers: (1) the SSE heartbeat comment every 15s keeps
// proxies from idling the connection, (2) `event: complete` closes
// cleanly on the engine side. The 90min cap remains only as a last-
// resort runaway-protection — a healthy long cycle that needs more than
// 90min should just trigger client-side reconnect (browsers do this for
// SSE by default).
const MAX_STREAM_DURATION_MS = 90 * 60 * 1000;

interface CycleSnapshot {
	status: string;
	cycleType: string;
	pagesDiscovered: number;
	findingsCount: number;
	durationMs: number;
	// Wave 22 Fase B — phase-level progress + heal signal.
	currentPhase: string | null;
	phaseUpdatedAt: string | null;
	healing: { reason: string; sinceMs: number } | null;
}

interface IdentitySnapshot {
	industry: string | null;
	industryConfidence: number | null;
	primaryLocale: string | null;
	detectedPlatforms: string[];
	aiBotPolicy: unknown;
}

interface FindingPreview {
	id: string;
	inferenceKey: string;
	title: string;
	severity: string;
	surface: string;
	impactMidpoint: number;
}

// Wave 22 Fase B+ — phase narrative moved to client-side i18n. The
// SSE event now ships just the phase key; the client translates via
// `t('console.first_audit.phase_narrative.${phase}')`. Keeps locale
// negotiation in one place (next-intl) instead of duplicating a
// per-locale map server-side.

// Heal triggers: cycle is "running" but the phase hasn't advanced in
// HEAL_PHASE_STALE_MS, OR heartbeat is older than HEAL_HEARTBEAT_STALE_MS.
// We only surface the BANNER to the customer — the actual heal cron in
// apps/audit-runner already runs every 60s. This is just to make the
// auto-heal visible instead of showing an apparently-frozen progress bar.
const HEAL_PHASE_STALE_MS = 90_000; // 90s without phase advance
const HEAL_HEARTBEAT_STALE_MS = 120_000; // 2min without heartbeat

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

	async function snapshot(): Promise<{
		cycle: CycleSnapshot;
		environmentId: string | null;
	} | null> {
		const row = await prisma.auditCycle.findUnique({
			where: { id: cycleId },
			select: {
				status: true,
				cycleType: true,
				createdAt: true,
				completedAt: true,
				environmentId: true,
				currentPhase: true,
				phaseUpdatedAt: true,
				lastHeartbeatAt: true,
			},
		});
		if (!row) return null;

		// Finding count: everything persisted so far for this cycle.
		const findingsCount = await prisma.finding.count({ where: { cycleId } });

		// Pages discovered during this cycle.
		let pagesDiscovered = 0;
		try {
			pagesDiscovered = await prisma.pageInventoryItem.count({
				where: {
					environmentRef: row.environmentId,
					createdAt: { gte: row.createdAt },
				},
			});
		} catch {
			// defensive — progress bar still works with pagesDiscovered=0
		}

		const durationMs =
			(row.completedAt?.getTime() ?? Date.now()) - row.createdAt.getTime();

		// Wave 22 Fase B — heal signal. Surfaced to the UI so the
		// customer sees an "auto-recovering" banner instead of an
		// apparently-frozen progress card.
		let healing: CycleSnapshot["healing"] = null;
		if (row.status === "running") {
			const nowMs = Date.now();
			if (row.phaseUpdatedAt) {
				const sinceMs = nowMs - row.phaseUpdatedAt.getTime();
				if (sinceMs > HEAL_PHASE_STALE_MS) {
					healing = { reason: "stuck_in_phase", sinceMs };
				}
			}
			if (!healing && row.lastHeartbeatAt) {
				const sinceMs = nowMs - row.lastHeartbeatAt.getTime();
				if (sinceMs > HEAL_HEARTBEAT_STALE_MS) {
					healing = { reason: "heartbeat_stale", sinceMs };
				}
			}
		}

		return {
			cycle: {
				status: row.status,
				cycleType: row.cycleType,
				pagesDiscovered,
				findingsCount,
				durationMs,
				currentPhase: row.currentPhase,
				phaseUpdatedAt: row.phaseUpdatedAt?.toISOString() ?? null,
				healing,
			},
			environmentId: row.environmentId,
		};
	}

	async function identitySnapshot(envId: string): Promise<IdentitySnapshot | null> {
		try {
			const fp = await prisma.domainFingerprint.findUnique({
				where: { environmentId: envId },
				select: {
					industry: true,
					industryConfidence: true,
					primaryLocale: true,
					detectedPlatforms: true,
					aiBotPolicy: true,
				},
			});
			if (!fp) return null;
			return {
				industry: fp.industry,
				industryConfidence: fp.industryConfidence,
				primaryLocale: fp.primaryLocale,
				detectedPlatforms: fp.detectedPlatforms || [],
				aiBotPolicy: fp.aiBotPolicy,
			};
		} catch {
			return null;
		}
	}

	async function findingsSince(
		lastFindingId: string | null,
	): Promise<FindingPreview[]> {
		try {
			const rows = await prisma.finding.findMany({
				where: {
					cycleId,
					...(lastFindingId ? { id: { gt: lastFindingId } } : {}),
				},
				orderBy: { id: "asc" },
				take: 20,
				select: {
					id: true,
					inferenceKey: true,
					severity: true,
					surface: true,
					impactMidpoint: true,
					projection: true,
				},
			});
			return rows.map((row) => {
				let title = row.inferenceKey;
				try {
					const proj = JSON.parse(row.projection);
					if (proj?.title) title = proj.title;
				} catch {}
				return {
					id: row.id,
					inferenceKey: row.inferenceKey,
					title,
					severity: row.severity,
					surface: row.surface || "",
					impactMidpoint: row.impactMidpoint || 0,
				};
			});
		} catch {
			return [];
		}
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

			// Wave 22 Fase B — three pieces of state we diff across ticks so
			// we only emit events when something genuinely changed (saves
			// bytes + lets the client render reactively):
			//   - lastPhaseEmitted     → phase boundary tracking
			//   - lastFindingIdEmitted → newest finding row seen
			//   - identityEmitted      → DomainFingerprint already streamed
			let lastPhaseEmitted: string | null = null;
			let lastFindingIdEmitted: string | null = null;
			let identityEmitted = false;
			let lastHealingKey: string | null = null;

			// Send an initial snapshot immediately so the UI paints without
			// waiting a full poll interval.
			const initial = await snapshot();
			if (!initial) {
				send("error", { message: "Cycle not found" });
				close();
				return;
			}
			lastSerialized = JSON.stringify(initial.cycle);
			send("status", initial.cycle);
			if (initial.cycle.currentPhase) {
				lastPhaseEmitted = initial.cycle.currentPhase;
				send("phase", {
					phase: initial.cycle.currentPhase,
					at: initial.cycle.phaseUpdatedAt,
				});
			}
			if (initial.environmentId) {
				const id = await identitySnapshot(initial.environmentId);
				if (id && (id.industry || id.detectedPlatforms.length > 0 || id.primaryLocale)) {
					identityEmitted = true;
					send("identity", id);
				}
			}
			// Emit any findings that already exist (cycle may have been
			// running for some time before the client connected).
			const initialFindings = await findingsSince(null);
			if (initialFindings.length > 0) {
				lastFindingIdEmitted = initialFindings[initialFindings.length - 1].id;
				for (const f of initialFindings) send("finding", f);
			}
			if (initial.cycle.status === "complete" || initial.cycle.status === "failed") {
				send("complete", { status: initial.cycle.status, cycleId });
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

					// Aggregate status diff — only emit when something changed.
					const serialized = JSON.stringify(snap.cycle);
					if (serialized !== lastSerialized) {
						lastSerialized = serialized;
						send("status", snap.cycle);
					}

					// Phase event — fires when currentPhase transitions.
					if (snap.cycle.currentPhase && snap.cycle.currentPhase !== lastPhaseEmitted) {
						lastPhaseEmitted = snap.cycle.currentPhase;
						send("phase", {
							phase: snap.cycle.currentPhase,
							at: snap.cycle.phaseUpdatedAt,
						});
					}

					// Identity — fires once, when DomainFingerprint materializes.
					if (!identityEmitted && snap.environmentId) {
						const id = await identitySnapshot(snap.environmentId);
						if (id && (id.industry || id.detectedPlatforms.length > 0 || id.primaryLocale)) {
							identityEmitted = true;
							send("identity", id);
						}
					}

					// Healing — emitted on transition (none → healing or change of reason).
					const healingKey = snap.cycle.healing
						? `${snap.cycle.healing.reason}`
						: null;
					if (healingKey !== lastHealingKey) {
						lastHealingKey = healingKey;
						if (snap.cycle.healing) {
							send("healing", snap.cycle.healing);
						} else if (lastHealingKey === null) {
							// transitioned out of healing — clear banner client-side.
							send("healing_clear", {});
						}
					}

					// Findings — every row newer than lastFindingIdEmitted.
					const fresh = await findingsSince(lastFindingIdEmitted);
					for (const f of fresh) {
						send("finding", f);
						lastFindingIdEmitted = f.id;
					}

					if (snap.cycle.status === "complete" || snap.cycle.status === "failed") {
						send("complete", { status: snap.cycle.status, cycleId });
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
