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
import { pollMetaAdsData } from "../../workers/meta-ads/poller";
import { pollGoogleAdsData } from "../../workers/google-ads/poller";
import { pollStripeData } from "../../workers/stripe/poller";
import { decryptConfig } from "@/libs/integration-crypto";
import type { IntegrationSnapshot } from "../../packages/integrations/types";
import type { Evidence } from "../../packages/domain";
import { triggerIncidentNotifications } from "@/libs/notification-triggers";
import { analyzeAdMessageMatch } from "../../workers/ingestion/enrichment/ad-message-match";

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

		// ── Wave 5 Fase 3 — incremental cycle prep ──
		// Resolve cycleType into a runtime CycleMode. Legacy DB rows use
		// "full"; new scheduler-produced rows use "hot"/"warm"/"cold".
		// Any unknown value falls back to cold so we always do the safe
		// thing (full pipeline, no carry-forward).
		const {
			CYCLE_MODE_CONFIG,
			resolveCriticalSurfaces,
			buildUrlAllowList,
			carryEvidenceForward,
			getPreviousCompletedCycle,
			canonicalizeUrl,
		} = await import("./cycle-modes");
		const declaredType = (cycle.cycleType || "cold").toLowerCase();
		// Mutable: the first-cycle fallback downgrades hot/warm → cold
		// because we have nothing to carry forward from. Keeping it `let`
		// means `pipelineMode` + `behavioralWindowHours` + `modeConfig`
		// all follow the downgrade automatically instead of running a
		// half-broken shallow_plus baseline.
		let cycleMode: "hot" | "warm" | "cold" =
			declaredType === "hot"
				? "hot"
				: declaredType === "warm"
					? "warm"
					: "cold";
		let modeConfig = CYCLE_MODE_CONFIG[cycleMode];

		// For hot/warm: build allow-list from critical surfaces + rotating
		// sample. For cold: null → pipeline crawls everything.
		let urlFilter: string[] | null = null;
		let prevCycle: Awaited<ReturnType<typeof getPreviousCompletedCycle>> = null;
		let carryForwardSummary = { carriedUrls: 0, uncoveredUrls: 0, rowsCarried: 0 };

		if (cycleMode !== "cold") {
			prevCycle = await getPreviousCompletedCycle(prisma, env.id, cycleId);
			if (!prevCycle) {
				// Wave 5 Fase 3 fix (#3): no prior baseline → this hot/warm
				// request is the first cycle for this env. Actually downgrade
				// to cold (not just log) so pipelineMode, budget, and
				// behavioral window all follow. Without this the cycle
				// would run as shallow_plus with a 1h behavioral window,
				// producing a garbage baseline that the next real hot
				// would diff against and emit false regressions.
				console.log(
					`[audit-runner ${cycleId}] no prior cycle found — downgrading ${cycleMode} → cold for this first run`,
				);
				cycleMode = "cold";
				modeConfig = CYCLE_MODE_CONFIG.cold;
			} else {
				const criticalSet = await resolveCriticalSurfaces(prisma, env.id);
				// Fase 3 fix #7: canonicalize inventory URLs before the
				// allow-list intersect so trailing-slash / query-string
				// drift doesn't silently exclude valid pages. The set
				// produced by resolveCriticalSurfaces is already canonical.
				const inventoryUrls = await prisma.pageInventoryItem
					.findMany({
						where: { environmentRef: env.id },
						select: { normalizedUrl: true },
						take: 500,
					})
					.then((rows) => rows.map((r) => canonicalizeUrl(r.normalizedUrl)))
					.catch(() => [] as string[]);
				urlFilter = buildUrlAllowList({
					mode: cycleMode,
					critical: criticalSet,
					allInventoryUrls: inventoryUrls,
				});

				// Wave 5 Fase 3 fix (#2): carry evidence forward ONLY for
				// URLs OUTSIDE the allow-list (i.e. pages this cycle won't
				// re-crawl). Those pages still need representation in the
				// recompute evidence set or the engine sees them as "page
				// disappeared" and emits phantom regressions. Pages INSIDE
				// the allow-list will be freshly crawled and produce new
				// evidence — carrying forward for them would double-count
				// (duplicate rows with different evidence_key but same
				// URL), biasing averages in signal extraction.
				if (!modeConfig.disableCarryForward && urlFilter) {
					const allowSet = new Set<string>(urlFilter);
					const urlsToCarry = inventoryUrls.filter((u) => !allowSet.has(u));
					if (urlsToCarry.length > 0) {
						const cf = await carryEvidenceForward(prisma, {
							previousCycleRef: prevCycle.cycleRef,
							newCycleRef: `audit_cycle:${cycleId}`,
							environmentRef: env.id,
							urls: urlsToCarry,
						});
						carryForwardSummary = {
							carriedUrls: cf.carriedUrls.length,
							uncoveredUrls: cf.uncoveredUrls.length,
							rowsCarried: cf.rowsCarried,
						};
						console.log(
							`[audit-runner ${cycleId}] ${cycleMode} carry-forward: ${cf.rowsCarried} rows across ${cf.carriedUrls.length} non-allowlisted urls (${cf.uncoveredUrls.length} uncovered)`,
						);
					}
				}
			}
		}

		// Stage D (Selective Headless) gates on `mode === 'full'`. Hot/warm
		// cycles are time-budgeted and skipping Stage D on them is
		// deliberate — browser verification is the most expensive step
		// and only pays off in a full-baseline context. Cold runs
		// everything; hot/warm run the crawl + engine but skip Playwright.
		const pipelineMode: "full" | "shallow_plus" = cycleMode === "cold" ? "full" : "shallow_plus";

		const result = await runStagedPipeline(
			{
				domain,
				workspace_ref: `workspace:${cycle.organizationId}`,
				environment_ref: `environment:${env.id}`,
				website_ref: `website:${website.id}`,
				cycle_ref: `audit_cycle:${cycleId}`,
				mode: pipelineMode,
				onboarding_business_model: businessProfileForPipeline?.businessModel ?? undefined,
				onboarding_conversion_model: businessProfileForPipeline?.conversionModel ?? undefined,
				// Wave 5 Fase 3 — url_filter scopes the crawl to the
				// cycle's allow-list. Cold cycles pass null/undefined here
				// and crawl everything.
				url_filter: urlFilter ?? undefined,
				crawl_constraints: {
					// Honor the per-mode wall-clock budget. Cold uses the
					// default 60s; hot caps at 60s anyway but warm gets
					// 4min to cover its sample.
					global_timeout_ms: modeConfig.cycleBudgetMs,
					// Fase 3 fix #4 cont. — override shallow_plus's default
					// 6-page cap when the allow-list exceeds it. +1 for the
					// homepage which the pipeline always retains.
					...(urlFilter && urlFilter.length > 0
						? { max_pages_per_domain: urlFilter.length + 1 }
						: {}),
				},
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
		// persistenceInProgress distinguishes "transactional completion
		// failed — fatal" from "prep step threw — non-fatal" inside the
		// shared catch. cycleMarkedComplete tracks whether the transaction
		// already landed the completion so the fallback mark-complete
		// below doesn't double-update.
		let persistenceInProgress = false;
		let cycleMarkedComplete = false;
		let projectionsForNotifications: any[] = [];
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
					// Wave 5 Fase 3 — scope the behavioral window to the
					// current cycle mode (hot=1h, warm=24h, cold=30d).
					modeConfig.behavioralWindowHours,
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
						// Extract crawled page paths for promoted product cross-reference
						const crawledPaths = (result.coverage_entries || []).map((e: any) => {
							try { return new URL(e.url).pathname; } catch { return e.url; }
						});
						const pollResult = await pollShopifyData({
							shop_domain: shopDomain,
							access_token: config.access_token,
							api_key: config.api_key || '',
							api_secret: config.api_secret || '',
						}, {}, crawledPaths);

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

					// Meta Ads integration — ad spend + creatives from Marketing API.
					// Poller returns MetaAdsSnapshotData directly; no adapter needed.
					const metaAdsConn = integrationConnections.find(c => c.provider === 'meta_ads');
					if (metaAdsConn) {
						try {
							const config = decryptConfig(metaAdsConn.config);
							const metaPollResult = await pollMetaAdsData({
								access_token: config.access_token,
								ad_account_id: config.ad_account_id,
								token_issued_at: config.token_issued_at ? Number(config.token_issued_at) : undefined,
								token_expires_in_sec: config.token_expires_in_sec ? Number(config.token_expires_in_sec) : undefined,
							});

							if (metaPollResult.errors.length === 0 || metaPollResult.data.ad_spend_30d > 0) {
								integrationSnapshots.push({
									provider: 'meta_ads',
									fetched_at: new Date().toISOString(),
									window: '30d',
									data: metaPollResult.data,
								});
							}

							// If token was refreshed, update stored credentials with new token.
							if (metaPollResult.refreshed_token) {
								try {
									const updatedConfig = {
										...config,
										access_token: metaPollResult.refreshed_token.access_token,
										token_issued_at: String(metaPollResult.refreshed_token.token_issued_at),
										token_expires_in_sec: String(metaPollResult.refreshed_token.token_expires_in_sec),
									};
									const { encryptConfig } = await import("@/libs/integration-crypto");
									const reEncrypted = encryptConfig(updatedConfig);
									await prisma.integrationConnection.update({
										where: { id: metaAdsConn.id },
										data: { config: reEncrypted },
									});
									console.log(`[audit-runner ${cycleId}] Meta Ads token refreshed successfully`);
								} catch (refreshErr) {
									console.warn(`[audit-runner ${cycleId}] Meta Ads token refresh persist failed:`, refreshErr);
								}
							}

							// Filter out token_refresh_warning from error count for status determination
							const realErrors = metaPollResult.errors.filter(e => !e.startsWith("token_refresh_warning:"));
							const tokenExpiresAt = metaPollResult.refreshed_token
								? metaPollResult.refreshed_token.token_issued_at + metaPollResult.refreshed_token.token_expires_in_sec * 1000
								: (config.token_issued_at && config.token_expires_in_sec
									? Number(config.token_issued_at) + Number(config.token_expires_in_sec) * 1000
									: null);

							await prisma.integrationConnection.update({
								where: { id: metaAdsConn.id },
								data: {
									lastSyncedAt: new Date(),
									status: realErrors.length > 0 ? 'error' : 'connected',
									syncError: realErrors[0] ?? null,
									syncMetadata: JSON.stringify({
										ad_spend_30d: metaPollResult.data.ad_spend_30d,
										currency: metaPollResult.data.currency,
										creative_count: metaPollResult.data.creatives.length,
										synced_at: new Date().toISOString(),
										...(tokenExpiresAt ? { token_expires_at: tokenExpiresAt } : {}),
									}),
								},
							});

							console.log(
								`[audit-runner ${cycleId}] Meta Ads integration synced (spend_30d=${metaPollResult.data.ad_spend_30d} ${metaPollResult.data.currency}, creatives=${metaPollResult.data.creatives.length}, errors=${metaPollResult.errors.length})`,
							);
						} catch (err) {
							console.warn(`[audit-runner ${cycleId}] Meta Ads integration sync failed:`, err);
							await prisma.integrationConnection.update({
								where: { id: metaAdsConn.id },
								data: { syncError: err instanceof Error ? err.message : 'Unknown error' },
							}).catch(() => { /* swallow secondary error */ });
						}
					}

					// Google Ads integration — spend + campaigns + RSA creative text.
					const googleAdsConn = integrationConnections.find(c => c.provider === 'google_ads');
					if (googleAdsConn) {
						try {
							const config = decryptConfig(googleAdsConn.config);
							const googlePollResult = await pollGoogleAdsData({
								developer_token: config.developer_token,
								client_id: config.client_id,
								client_secret: config.client_secret,
								refresh_token: config.refresh_token,
								customer_id: config.customer_id,
								login_customer_id: config.login_customer_id || undefined,
							});

							if (googlePollResult.errors.length === 0 || googlePollResult.data.ad_spend_30d > 0) {
								integrationSnapshots.push({
									provider: 'google_ads',
									fetched_at: new Date().toISOString(),
									window: '30d',
									data: googlePollResult.data,
								});
							}

							// If refresh token was revoked, mark disconnected instead of error
							const connectionStatus = googlePollResult.token_revoked
								? 'disconnected'
								: googlePollResult.errors.length > 0
									? 'error'
									: 'connected';

							await prisma.integrationConnection.update({
								where: { id: googleAdsConn.id },
								data: {
									lastSyncedAt: new Date(),
									status: connectionStatus,
									syncError: googlePollResult.errors[0] ?? null,
									syncMetadata: JSON.stringify({
										ad_spend_30d: googlePollResult.data.ad_spend_30d,
										currency: googlePollResult.data.currency,
										campaign_count: googlePollResult.data.campaigns.length,
										synced_at: new Date().toISOString(),
										...(googlePollResult.token_revoked ? { token_revoked: true } : {}),
									}),
								},
							});

							if (googlePollResult.token_revoked) {
								console.warn(
									`[audit-runner ${cycleId}] Google Ads refresh token revoked — connection marked disconnected`,
								);
							} else {
								console.log(
									`[audit-runner ${cycleId}] Google Ads integration synced (spend_30d=${googlePollResult.data.ad_spend_30d} ${googlePollResult.data.currency}, campaigns=${googlePollResult.data.campaigns.length}, errors=${googlePollResult.errors.length})`,
								);
							}
						} catch (err) {
							console.warn(`[audit-runner ${cycleId}] Google Ads integration sync failed:`, err);
							await prisma.integrationConnection.update({
								where: { id: googleAdsConn.id },
								data: { syncError: err instanceof Error ? err.message : 'Unknown error' },
							}).catch(() => { /* swallow secondary error */ });
						}
					}

					// Stripe integration — revenue, MRR, churn, disputes, refunds.
					const stripeConn = integrationConnections.find(c => c.provider === 'stripe' && c.status === 'connected');
					if (stripeConn) {
						try {
							const config = decryptConfig(stripeConn.config);
							const stripePollResult = await pollStripeData({
								access_token: config.access_token,
								stripe_user_id: config.stripe_user_id,
							});

							if (stripePollResult.errors.length === 0) {
								integrationSnapshots.push({
									provider: 'stripe',
									fetched_at: new Date().toISOString(),
									window: '30d',
									data: stripePollResult.data,
								});
							}

							await prisma.integrationConnection.update({
								where: { id: stripeConn.id },
								data: {
									lastSyncedAt: new Date(),
									status: stripePollResult.errors.length > 0 ? 'error' : 'connected',
									syncError: stripePollResult.errors[0] ?? null,
									syncMetadata: JSON.stringify({
										mrr: stripePollResult.data.mrr,
										dispute_rate: stripePollResult.data.dispute_rate,
										charge_count: stripePollResult.data.revenue.charge_count,
										synced_at: new Date().toISOString(),
									}),
								},
							});

							console.log(
								`[audit-runner ${cycleId}] Stripe integration synced (revenue=${stripePollResult.data.revenue.total} ${stripePollResult.data.revenue.currency}, mrr=${stripePollResult.data.mrr}, disputes=${stripePollResult.data.dispute_rate}, errors=${stripePollResult.errors.length})`,
							);
						} catch (err) {
							console.warn(`[audit-runner ${cycleId}] Stripe integration sync failed:`, err);
							await prisma.integrationConnection.update({
								where: { id: stripeConn.id },
								data: { syncError: err instanceof Error ? err.message : 'Unknown error' },
							}).catch(() => { /* swallow secondary error */ });
						}
					}
				} catch (err) {
					console.warn(`[audit-runner ${cycleId}] integration connections lookup failed:`, err);
					// Non-fatal — the cycle still works without integration data.
				}

			// (b-pre) Wave 3.9 C-E: Ad-LP message-match analysis (LLM enrichment)
			// Only on cold (full) cycles — hot/warm skip the LLM cost.
			if (cycleMode === 'cold' && integrationSnapshots.length > 0) {
				try {
					const adMatchEvidence = await analyzeAdMessageMatch(
						integrationSnapshots,
						result.evidence,
						{
							workspace_ref: workspaceRef,
							environment_ref: environmentRef,
							subject_ref: `website:${website.id}`,
							path_scope: null,
						},
						cycleRefStr,
					);
					if (adMatchEvidence.length > 0) {
						result.evidence.push(...adMatchEvidence);
						console.log(
							`[audit-runner ${cycleId}] ad-LP message match: ${adMatchEvidence.length} pairs analyzed`,
						);
					}
				} catch (err) {
					console.warn(`[audit-runner ${cycleId}] ad-LP message match failed:`, err);
					// Non-fatal — the cycle still produces all other findings.
				}
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
				conversion_proximity: 3, // mid-funnel default (1=checkout, 5=homepage); <= 2 triggers severity escalation
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

			// (d+e+complete) Transactional persistence.
			//
			// Before this block existed, snapshot save, findings save, and
			// cycle.status='complete' ran in three separate awaits. A crash
			// between them (or a catastrophic finding-upsert loss) left the
			// DB in a half-written state: cycle marked complete with 0
			// findings persisted, dashboard showed stale data from a
			// previous cycle, and the user had no signal anything was wrong.
			//
			// Now the three writes go in a single Prisma interactive tx.
			// If ANY fails — including the explicit catastrophic-loss
			// throw when 0/N findings upserted — the tx rolls back
			// atomically and the error propagates to the outer catch,
			// which marks the cycle FAILED instead of complete. Heal cron
			// will pick that up and the next scheduled audit retries.
			//
			// Partial loss (some written, some failed) is still treated as
			// complete — majority findings are queryable and the next
			// cycle re-persists everything anyway. The failed rows are
			// logged at ERROR level for monitoring.
			//
			// persistenceInProgress flag lets the outer try's catch
			// distinguish "the transaction failed — fatal" from "behavioral
			// processing threw earlier — non-fatal". Without it, the same
			// catch would swallow both.
			persistenceInProgress = true;
			await prisma.$transaction(
				async (tx: any) => {
					if (multiPackResult.current_snapshot) {
						await snapshotStore.asyncSave(
							multiPackResult.current_snapshot,
							cycleId,
							tx,
						);
						console.log(
							`[audit-runner ${cycleId}] snapshot saved (${multiPackResult.current_snapshot.metadata.decision_count} decisions, ${multiPackResult.current_snapshot.metadata.signal_count} signals, recompute ${recomputeMs}ms)`,
						);
					}

					const saveResult = await findingStore.saveForCycle(
						{
							cycleId,
							environmentId: env.id,
							cycleRef: cycleRefStr,
							findings: projections.findings,
						},
						tx,
					);
					if (saveResult.failed.length > 0) {
						console.error(
							`[audit-runner ${cycleId}] findings persistence had ${saveResult.failed.length}/${saveResult.attempted} failures`,
							saveResult.failed.slice(0, 5),
						);
					}
					if (saveResult.attempted > 0 && saveResult.written === 0) {
						throw new Error(
							`catastrophic findings persistence loss: 0/${saveResult.attempted} written — aborting cycle completion`,
						);
					}
					console.log(
						`[audit-runner ${cycleId}] persisted ${saveResult.written}/${saveResult.attempted} findings`,
					);

					await tx.auditCycle.update({
						where: { id: cycleId },
						data: {
							status: "complete",
							completedAt: new Date(),
						},
					});
				},
				// Default 5s is tight for cycles with hundreds of findings
				// on a loaded DB. 30s gives headroom without hiding a
				// genuinely stuck connection.
				{ timeout: 30_000 },
			);
			persistenceInProgress = false;
			cycleMarkedComplete = true;

			projectionsForNotifications = projections.findings;

			// (f) Retention prune — best-effort, outside the transaction
			try {
				await snapshotStore.asyncPrune(workspaceRef, environmentRef);
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] snapshot prune failed:`, err);
			}
		} catch (err) {
			if (persistenceInProgress) {
				// Transactional cycle completion failed — bail to the outer
				// catch so the cycle is marked FAILED. Dashboard showing
				// "audit failed, retry" is strictly better than an empty
				// state from half-written data.
				console.error(
					`[audit-runner ${cycleId}] transactional cycle completion failed:`,
					err,
				);
				throw err;
			}
			// Prep/recompute failure upstream of the transaction — the
			// cycle can still complete because evidence + inventory are
			// already in DB and ensureContext() will recompute lazily on
			// next request.
			console.error(
				`[audit-runner ${cycleId}] recompute/persist block failed (non-fatal):`,
				err,
			);
		}

		// (e2) Trigger notifications for critical findings — best-effort,
		// outside the transaction so a SMTP hiccup can't rollback data.
		if (projectionsForNotifications.length > 0) {
			try {
				await triggerIncidentNotifications({
					userId: cycle.organization.ownerId,
					domain: env.domain,
					findings: projectionsForNotifications,
				});
			} catch {
				// Non-fatal: notification failure shouldn't block the audit
			}
		}

		// (e3) Attribution confirmation job — scans UserActions the
		// operator marked as done and stamps `verifiedResolvedAt` when
		// the current cycle confirms the underlying finding is resolved
		// (or no longer present under its inferenceKey). Fires a
		// celebration email per confirmation. Non-fatal: we're
		// observing/rewarding, not persisting state the rest of the
		// audit depends on.
		try {
			const { runAttributionConfirmation } = await import(
				"@/libs/attribution-confirmation"
			);
			const attribResult = await runAttributionConfirmation({
				cycleId,
				environmentId: env.id,
				// cycleRef is synthesized deterministically throughout
				// this file (see line ~395) — Finding.cycleRef and
				// UserAction.baselineCycleRef use the same pattern.
				cycleRef: `audit_cycle:${cycleId}`,
				organizationId: cycle.organizationId,
				domain: env.domain,
			});
			if (attribResult.confirmed > 0) {
				console.log(
					`[audit-runner ${cycleId}] attribution: confirmed ${attribResult.confirmed}/${attribResult.scanned} user actions (${attribResult.errors} errors)`,
				);
			}
		} catch (err) {
			console.warn(
				`[audit-runner ${cycleId}] attribution confirmation failed (non-fatal):`,
				err,
			);
		}

		// Fallback mark-complete for the non-transactional path. If we
		// reached the transaction and it succeeded, cycleMarkedComplete is
		// true and this is a no-op. If prep threw before the transaction
		// started, we still want the cycle to land in `complete` (evidence
		// + inventory are in DB, ensureContext() will recompute lazily).
		if (!cycleMarkedComplete) {
			await prisma.auditCycle.update({
				where: { id: cycleId },
				data: { status: "complete", completedAt: new Date() },
			});
		}

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
