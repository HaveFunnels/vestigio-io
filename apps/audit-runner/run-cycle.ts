// ──────────────────────────────────────────────
// Audit Runner — Background Worker
//
// Picks up an AuditCycle row in `pending` status and executes it end-to-end:
//   1. Mark cycle as `running`
//   2. Resolve org → environment → website (upsert Website if missing)
//   3. Run staged pipeline (workers/ingestion/staged-pipeline.ts)
//   4. Persist Evidence to Postgres via PrismaEvidenceStore
//   5. Persist PageInventoryItem rows from coverage map
//   6. Mark cycle as `complete` (or `failed` on error)
//
// Designed to be called fire-and-forget from webhook handlers:
//
//   const cycle = await prisma.auditCycle.create({...});
//   import('@/../apps/audit-runner/run-cycle').then(m =>
//     m.runAuditCycle(cycle.id).catch(err => console.error(...))
//   );
//
// The webhook returns 200 immediately; the worker keeps running in the
// background of the Next.js process. A heal cron in instrumentation.ts
// recovers cycles that get stuck (process restart, crash, etc).
// ──────────────────────────────────────────────

import { prisma } from "@/libs/prismaDb";
import { runStagedPipeline, type PipelineEvent } from "../../workers/ingestion/staged-pipeline";
import { PrismaEvidenceStore } from "../../packages/evidence";
import { PrismaSnapshotStore } from "../../packages/change-detection";
import { PrismaFindingStore, projectAll } from "../../packages/projections";
import { recomputeAll } from "../../packages/workspace";
import { loadEngineTranslationsForLocale } from "@/lib/engine-translations";
import { processBehavioralEventsForEnv } from "./process-behavioral";
import { pollShopifyData } from "../../workers/shopify/poller";
import { mapPollResultToSnapshotData as mapShopifyPollResult } from "../../packages/shopify-adapter/snapshot-mapper";
import { pollNuvemshopData } from "../../workers/nuvemshop/poller";
import { mapPollResultToSnapshotData as mapNuvemshopPollResult } from "../../packages/nuvemshop-adapter/snapshot-mapper";
import { decryptConfig } from "@/libs/integration-crypto";
import type { IntegrationSnapshot } from "../../packages/integrations/types";
import type { Evidence } from "../../packages/domain";
import { triggerIncidentNotifications } from "@/libs/notification-triggers";

export interface RunAuditCycleResult {
	cycleId: string;
	status: "complete" | "failed";
	pagesDiscovered: number;
	evidenceCount: number;
	durationMs: number;
	error?: string;
}

// Page-type heuristics — keep in sync with /api/inventory expectations.
// Falls back to "other" if nothing matches.
const PAGE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string; tier: string }> = [
	{ pattern: /\/(checkout|cart|carrinho|comprar|pay|payment|billing)/i, type: "checkout", tier: "primary" },
	{ pattern: /\/(product|produto|item|p\/)/i, type: "product", tier: "primary" },
	{ pattern: /\/(pricing|preco|planos|plans)/i, type: "pricing", tier: "primary" },
	{ pattern: /\/(login|signin|signup|register|account|conta)/i, type: "account", tier: "secondary" },
	{ pattern: /\/(privacy|terms|refund|return|shipping|cookie|policy|termos|privacidade|reembolso|devolucao|frete)/i, type: "policy", tier: "tertiary" },
	{ pattern: /\/(contact|contato|support|suporte|help|faq|fale-conosco)/i, type: "support", tier: "secondary" },
	{ pattern: /\/(blog|news|noticia|article|post)/i, type: "blog", tier: "tertiary" },
	{ pattern: /\/(category|categoria|collection|colecao)/i, type: "category", tier: "secondary" },
];

function inferPageType(pathname: string): { pageType: string; tier: string } {
	if (pathname === "/" || pathname === "") {
		return { pageType: "landing", tier: "primary" };
	}
	for (const { pattern, type, tier } of PAGE_TYPE_PATTERNS) {
		if (pattern.test(pathname)) return { pageType: type, tier };
	}
	return { pageType: "other", tier: "tertiary" };
}

function safePathname(rawUrl: string): string {
	try {
		return new URL(rawUrl).pathname || "/";
	} catch {
		return "/";
	}
}

// Extract title from a PageContent evidence payload for the same URL, if any.
function findTitleForUrl(evidence: Evidence[], url: string): string | null {
	for (const ev of evidence) {
		if (ev.evidence_type === "page_content") {
			const p = ev.payload as any;
			if (p?.url === url && p?.title) return String(p.title);
		}
	}
	return null;
}

// Extract HTTP status from HttpResponse evidence for the same URL.
function findStatusForUrl(evidence: Evidence[], url: string): number | null {
	for (const ev of evidence) {
		if (ev.evidence_type === "http_response") {
			const p = ev.payload as any;
			if (p?.url === url && typeof p?.status_code === "number") return p.status_code;
		}
	}
	return null;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function runAuditCycle(cycleId: string): Promise<RunAuditCycleResult> {
	const startedAt = Date.now();
	let pagesDiscovered = 0;
	let evidenceCount = 0;

	// 1. Load + validate cycle
	const cycle = await prisma.auditCycle.findUnique({
		where: { id: cycleId },
		include: { environment: true, organization: true },
	});

	if (!cycle) {
		throw new Error(`AuditCycle ${cycleId} not found`);
	}

	if (cycle.status !== "pending") {
		// Already running or finished — silently return existing state.
		// Heal cron may double-fire; this is the idempotency guard.
		return {
			cycleId,
			status: cycle.status === "complete" ? "complete" : "failed",
			pagesDiscovered: 0,
			evidenceCount: 0,
			durationMs: 0,
		};
	}

	// 2. Mark running
	await prisma.auditCycle.update({
		where: { id: cycleId },
		data: { status: "running" },
	});

	try {
		const env = cycle.environment;
		const domain = env.domain;
		const landingUrl = env.landingUrl || `https://${domain}`;

		// 3. Upsert Website row — required for /api/inventory to find pages.
		// Without this, even successfully-crawled pages would be invisible.
		const website = await prisma.website.upsert({
			where: { environmentRef_domain: { environmentRef: env.id, domain } },
			create: {
				environmentRef: env.id,
				domain,
				rootUrl: landingUrl,
				isPrimary: true,
			},
			update: {},
		});

		// 4. Run staged pipeline (no-op emit since we're not streaming)
		const noopEmit = (_event: PipelineEvent) => {
			// Background worker — drop events. Could log to a JobLog table later.
		};

		// Look up the business profile early so we can pass business_model
		// into the pipeline. Stage D (Wave 1) uses this to pick the right
		// commercial-path scenario for the audit. Wave 0.7's recompute
		// also reads businessProfile but does its own lookup later — both
		// callers tolerate it being null.
		const businessProfileForPipeline = await prisma.businessProfile
			.findUnique({ where: { organizationId: cycle.organizationId } })
			.catch(() => null);

		const result = await runStagedPipeline(
			{
				domain,
				workspace_ref: `workspace:${cycle.organizationId}`,
				environment_ref: `environment:${env.id}`,
				website_ref: `website:${website.id}`,
				cycle_ref: `audit_cycle:${cycleId}`,
				// Wave 1: explicit mode = full so Stage D's gate (mode === 'full')
				// passes. The default is 'full' anyway, but being explicit makes
				// the intent obvious to readers.
				mode: 'full',
				// Stage D's business-aware scenario picker reads this. Falls back
				// to 'hybrid' scenarios when null (e.g. orgs that haven't completed
				// onboarding yet — those still get a useful generic probe).
				onboarding_business_model: businessProfileForPipeline?.businessModel ?? undefined,
				onboarding_conversion_model: businessProfileForPipeline?.conversionModel ?? undefined,
			},
			noopEmit,
		);

		evidenceCount = result.evidence.length;

		// 5. Persist evidence to Postgres
		try {
			const store = new PrismaEvidenceStore(prisma);
			await store.addMany(result.evidence);
		} catch (err) {
			console.error(`[audit-runner ${cycleId}] evidence persistence error:`, err);
			// Non-fatal — pipeline succeeded, just couldn't persist for warm restart.
		}

		// 6. Persist PageInventoryItem rows from coverage map
		// Each entry in coverage_entries represents a discovered surface (URL).
		for (const entry of result.coverage_entries || []) {
			try {
				const url = entry.url;
				const path = safePathname(url);
				const { pageType, tier } = inferPageType(path);
				const title = findTitleForUrl(result.evidence, url);
				const statusCode = findStatusForUrl(result.evidence, url);
				const isFresh = entry.validated && (statusCode == null || statusCode < 400);

				await prisma.pageInventoryItem.upsert({
					where: {
						environmentRef_normalizedUrl: {
							environmentRef: env.id,
							normalizedUrl: url,
						},
					},
					create: {
						websiteRef: website.id,
						environmentRef: env.id,
						normalizedUrl: url,
						path,
						pageType,
						tier,
						priority: entry.critical ? 10 : 0,
						criticality: Math.round(entry.confidence ?? 0),
						title,
						statusCode,
						freshnessState: isFresh ? "fresh" : "stale",
					},
					update: {
						title: title ?? undefined,
						statusCode: statusCode ?? undefined,
						freshnessState: isFresh ? "fresh" : "stale",
						criticality: Math.round(entry.confidence ?? 0),
					},
				});
				pagesDiscovered++;
			} catch (err) {
				console.error(`[audit-runner ${cycleId}] inventory upsert error for ${entry.url}:`, err);
				// Per-row failure is non-fatal — continue with the rest.
			}
		}

		// 7. Run the engine + project findings + persist snapshot & findings.
		// This is the part that makes change detection actually work and
		// what populates the real `finding_count` per surface in /api/inventory.
		//
		// Order:
		//   a. Load the previous snapshot for this workspace+env (if any)
		//   b. Run recomputeAll() with previous_snapshot → engine produces
		//      change_report when there's a previous to compare against
		//   c. projectAll() turns the engine output into FindingProjections
		//      (each carries change_class derived from change_report)
		//   d. Save the new snapshot to PrismaSnapshotStore so the NEXT
		//      cycle can see it as previous
		//   e. Save findings to PrismaFindingStore so the inventory + cold
		//      start path can read them without recomputing
		//   f. Prune old snapshots beyond retention cap
		//
		// Per-step failures are caught individually so a single store
		// hiccup can't fail the whole cycle (audit results in DB are
		// still useful even if the projection cache is stale).
		try {
			const workspaceRef = `workspace:${cycle.organizationId}`;
			const environmentRef = `environment:${env.id}`;
			const cycleRefStr = `audit_cycle:${cycleId}`;

			const snapshotStore = new PrismaSnapshotStore(prisma);
			const findingStore = new PrismaFindingStore(prisma);

			// (a) Previous snapshot
			let previousSnapshot = null;
			try {
				const prev = await snapshotStore.asyncGetLatest(workspaceRef, environmentRef);
				previousSnapshot = prev?.snapshot ?? null;
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] previous snapshot lookup failed (treating as first cycle):`, err);
			}

			// Reuse the BusinessProfile we already loaded for the pipeline
			// inputs above — same data, no second roundtrip.
			const businessProfile = businessProfileForPipeline;

			// Engine translations (locale-aware finding titles, root cause titles, etc.)
			//
			// We're in a worker context with no request cookie, so we can't read
			// the locale via Next's cookies() — instead we look up the org
			// owner's `User.locale` and pass it explicitly. Without this, the
			// audit always wrote findings in English regardless of the user's
			// preferred language, which is exactly what the user noticed in the
			// app: positive checks rendering "Conversion intent is clear and
			// unambiguous" instead of the translated equivalent.
			let translations;
			try {
				const owner = await prisma.user.findUnique({
					where: { id: cycle.organization.ownerId },
					select: { locale: true },
				});
				translations = loadEngineTranslationsForLocale(owner?.locale);
			} catch {
				translations = undefined;
			}

			// Wave 0.3: Process behavioral pixel events for this env and
			// append the resulting BehavioralSessionPayload as evidence so
			// the engine sees it in the same recompute pass. Returns an
			// empty result when there are no events in the 30-day window —
			// the engine handles the empty case gracefully (behavioral
			// inferences gated by session_count >= 20 in eligibility.ts).
			try {
				const behavioral = await processBehavioralEventsForEnv(
					env.id,
					{
						workspace_ref: workspaceRef,
						environment_ref: environmentRef,
						subject_ref: `website:${website.id}`,
						path_scope: null,
					},
					cycleRefStr,
				);
				if (behavioral.evidence.length > 0) {
					result.evidence.push(...behavioral.evidence);
					// Also persist to PrismaEvidenceStore so the cold-start
					// rehydration path (ensureContext → loadLatestCycle) sees
					// behavioral evidence after a server restart. The earlier
					// addMany() at step 5 ran before this evidence existed.
					try {
						const evidenceStore = new PrismaEvidenceStore(prisma);
						await evidenceStore.addMany(behavioral.evidence);
					} catch (err) {
						console.warn(
							`[audit-runner ${cycleId}] behavioral evidence persistence failed (in-cycle still works):`,
							err,
						);
					}
					console.log(
						`[audit-runner ${cycleId}] behavioral evidence added (sessions=${behavioral.sessionCount}, events=${behavioral.eventCount})`,
					);
				}
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] behavioral processing failed:`, err);
				// Non-fatal — the cycle still produces non-behavioral findings.
			}

			// Wave 0.4: Load integration connections for this environment
			// and fetch Shopify data if a connected Shopify integration
			// exists. The snapshot is passed to recomputeAll() so the
			// engine can factor real commerce data into its analysis.
			const integrationSnapshots: IntegrationSnapshot[] = [];
			try {
				const integrationConnections = await prisma.integrationConnection.findMany({
					where: { environmentId: env.id, status: 'connected' },
				});

				const shopifyConn = integrationConnections.find(c => c.provider === 'shopify');
				if (shopifyConn) {
					try {
						const config = decryptConfig(shopifyConn.config);
						// Normalize store_url → bare domain for the Shopify client
						// (user input may include protocol, e.g. "https://example.myshopify.com")
						const shopDomain = (config.store_url || '')
							.replace(/^https?:\/\//, '')
							.replace(/\/+$/, '');
						const pollResult = await pollShopifyData({
							shop_domain: shopDomain,
							access_token: config.access_token,
							api_key: config.api_key || '',
							api_secret: config.api_secret || '',
						});

						if (pollResult.metrics.length > 0) {
							const snapshot: IntegrationSnapshot<'shopify'> = {
								provider: 'shopify',
								fetched_at: new Date().toISOString(),
								window: '30d',
								data: mapShopifyPollResult(pollResult),
							};
							integrationSnapshots.push(snapshot);
						}

						// Update last synced timestamp
						await prisma.integrationConnection.update({
							where: { id: shopifyConn.id },
							data: { lastSyncedAt: new Date(), status: 'connected', syncError: null },
						});

						console.log(
							`[audit-runner ${cycleId}] Shopify integration synced (orders=${pollResult.orders_fetched}, basis=${pollResult.basis_type})`,
						);
					} catch (err) {
						// Non-fatal: log error but don't block the audit
						console.warn(`[audit-runner ${cycleId}] Shopify integration sync failed:`, err);
						await prisma.integrationConnection.update({
							where: { id: shopifyConn.id },
							data: { syncError: err instanceof Error ? err.message : 'Unknown error' },
						}).catch(() => { /* swallow secondary error */ });
					}
				}

					// Wave 0.5: Nuvemshop integration (same pattern as Shopify)
					const nuvemshopConn = integrationConnections.find(c => c.provider === 'nuvemshop');
					if (nuvemshopConn) {
						try {
							const config = decryptConfig(nuvemshopConn.config);
							const nuvemshopPollResult = await pollNuvemshopData({
								store_id: config.store_id || '',
								access_token: config.access_token,
							});

							if (nuvemshopPollResult.metrics.length > 0) {
								const snapshot: IntegrationSnapshot<'nuvemshop'> = {
									provider: 'nuvemshop',
									fetched_at: new Date().toISOString(),
									window: '30d',
									data: mapNuvemshopPollResult(nuvemshopPollResult),
								};
								integrationSnapshots.push(snapshot);
							}

							await prisma.integrationConnection.update({
								where: { id: nuvemshopConn.id },
								data: { lastSyncedAt: new Date(), status: 'connected', syncError: null },
							});

							console.log(
								`[audit-runner ${cycleId}] Nuvemshop integration synced (orders=${nuvemshopPollResult.orders_fetched}, basis=${nuvemshopPollResult.basis_type})`,
							);
						} catch (err) {
							console.warn(`[audit-runner ${cycleId}] Nuvemshop integration sync failed:`, err);
							await prisma.integrationConnection.update({
								where: { id: nuvemshopConn.id },
								data: { syncError: err instanceof Error ? err.message : 'Unknown error' },
							}).catch(() => { /* swallow secondary error */ });
						}
					}
				} catch (err) {
					console.warn(`[audit-runner ${cycleId}] integration connections lookup failed:`, err);
					// Non-fatal — the cycle still works without integration data.
				}

			// (b) Engine
			const recomputeStartMs = Date.now();
			const multiPackResult = recomputeAll({
				evidence: result.evidence,
				scoping: {
					workspace_ref: workspaceRef,
					environment_ref: environmentRef,
					subject_ref: `website:${website.id}`,
					path_scope: null,
				},
				cycle_ref: cycleRefStr,
				root_domain: domain,
				landing_url: landingUrl,
				conversion_proximity: 0.5,
				is_production: env.isProduction,
				onboarding_business_model: businessProfile?.businessModel ?? null,
				onboarding_conversion_model: businessProfile?.conversionModel ?? null,
				previous_snapshot: previousSnapshot,
				translations,
				integration_snapshots: integrationSnapshots.length > 0 ? integrationSnapshots : undefined,
			});
			const recomputeMs = Date.now() - recomputeStartMs;

			// (c) Project for the UI
			const projections = projectAll(multiPackResult, translations);

			// (d) Save snapshot — must be awaited so prune in step (f) sees it
			if (multiPackResult.current_snapshot) {
				try {
					await snapshotStore.asyncSave(multiPackResult.current_snapshot, cycleId);
					console.log(
						`[audit-runner ${cycleId}] snapshot saved (${multiPackResult.current_snapshot.metadata.decision_count} decisions, ${multiPackResult.current_snapshot.metadata.signal_count} signals, recompute ${recomputeMs}ms)`,
					);
				} catch (err) {
					console.error(`[audit-runner ${cycleId}] snapshot save failed:`, err);
				}
			}

			// (e) Save findings
			try {
				const written = await findingStore.saveForCycle({
					cycleId,
					environmentId: env.id,
					cycleRef: cycleRefStr,
					findings: projections.findings,
				});
				console.log(
					`[audit-runner ${cycleId}] persisted ${written}/${projections.findings.length} findings`,
				);
			} catch (err) {
				console.error(`[audit-runner ${cycleId}] findings save failed:`, err);
			}

			// (e2) Trigger notifications for critical findings
			try {
				await triggerIncidentNotifications({
					userId: cycle.organization.ownerId,
					domain: env.domain,
					findings: projections.findings,
				});
			} catch {
				// Non-fatal: notification failure shouldn't block the audit
			}

			// (f) Retention prune — keep last 10 snapshots per env
			try {
				await snapshotStore.asyncPrune(workspaceRef, environmentRef);
			} catch (err) {
				// Pruning is best-effort
				console.warn(`[audit-runner ${cycleId}] snapshot prune failed:`, err);
			}
		} catch (err) {
			// Recompute/persist failure is non-fatal — the cycle still
			// completes because evidence + inventory are already in DB.
			// On next request, ensureContext() will run a fresh recompute
			// from the persisted evidence.
			console.error(`[audit-runner ${cycleId}] recompute/persist block failed (non-fatal):`, err);
		}

		// 8. Mark complete
		await prisma.auditCycle.update({
			where: { id: cycleId },
			data: { status: "complete", completedAt: new Date() },
		});

		const durationMs = Date.now() - startedAt;
		console.log(
			`[audit-runner ${cycleId}] complete — ${pagesDiscovered} pages, ${evidenceCount} evidence, ${durationMs}ms`,
		);

		// Wave 5 Fase 1B — pay-as-you-go meter. Best-effort write of
		// cycles_run + pages_crawled + compute_seconds for this org. Failure
		// here must NOT change the cycle outcome; the helper swallows.
		try {
			const { recordCycleUsage } = await import("@/libs/usage-meter");
			await recordCycleUsage({
				organizationId: cycle.organizationId,
				cycleId,
				pagesCrawled: pagesDiscovered,
				computeSeconds: Math.round(durationMs / 1000),
			});
		} catch (err) {
			console.warn(`[audit-runner ${cycleId}] usage meter write failed:`, err);
		}

		return { cycleId, status: "complete", pagesDiscovered, evidenceCount, durationMs };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[audit-runner ${cycleId}] failed:`, errorMsg);

		await prisma.auditCycle
			.update({
				where: { id: cycleId },
				data: { status: "failed", completedAt: new Date() },
			})
			.catch(() => {
				/* swallow secondary error */
			});

		return {
			cycleId,
			status: "failed",
			pagesDiscovered,
			evidenceCount,
			durationMs: Date.now() - startedAt,
			error: errorMsg,
		};
	}
}

// ──────────────────────────────────────────────
// Heal helpers — called by cron in instrumentation.ts
// ──────────────────────────────────────────────

const STUCK_RUNNING_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const ORPHANED_PENDING_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Auto-fail any AuditCycle stuck in `running` for too long.
 * Returns the count of cycles that were healed.
 */
export async function healStuckCycles(): Promise<number> {
	const cutoff = new Date(Date.now() - STUCK_RUNNING_AFTER_MS);
	const result = await prisma.auditCycle.updateMany({
		where: { status: "running", createdAt: { lt: cutoff } },
		data: { status: "failed", completedAt: new Date() },
	});
	if (result.count > 0) {
		console.warn(`[audit-runner heal] auto-failed ${result.count} stuck running cycles`);
	}
	return result.count;
}

/**
 * Re-dispatch any AuditCycle that has been `pending` longer than the
 * orphan threshold. This catches cycles whose webhook fired but whose
 * worker died (process restart between create + dispatch).
 *
 * Wave 5 Fase 1A: prefers the Redis queue (re-enqueues at "cold"
 * priority — orphan recovery isn't latency-sensitive) so the dedicated
 * worker service picks it up. Falls back to in-process dispatch when
 * Redis isn't configured, preserving the original behavior for Redis-
 * less deploys.
 */
export async function redispatchOrphanedPending(): Promise<number> {
	const cutoff = new Date(Date.now() - ORPHANED_PENDING_AFTER_MS);
	const orphans = await prisma.auditCycle.findMany({
		where: { status: "pending", createdAt: { lt: cutoff } },
		select: { id: true, organizationId: true, environmentId: true },
		take: 10, // safety cap per heal pass
	});

	let enqueueModule: { enqueueAuditCycle: (i: any) => Promise<boolean> } | null = null;
	try {
		enqueueModule = await import("../platform/audit-cycle-queue");
	} catch {
		enqueueModule = null;
	}

	for (const o of orphans) {
		let enqueued = false;
		if (enqueueModule) {
			try {
				enqueued = await enqueueModule.enqueueAuditCycle({
					cycleId: o.id,
					environmentId: o.environmentId,
					organizationId: o.organizationId,
					priority: "cold",
				});
			} catch {
				enqueued = false;
			}
		}
		if (enqueued) {
			console.warn(`[audit-runner heal] re-enqueued orphan cycle ${o.id} → queue`);
		} else {
			console.warn(`[audit-runner heal] re-dispatching orphan cycle ${o.id} in-process`);
			runAuditCycle(o.id).catch((err) => {
				console.error(`[audit-runner heal] re-dispatch failed for ${o.id}:`, err);
			});
		}
	}
	return orphans.length;
}
