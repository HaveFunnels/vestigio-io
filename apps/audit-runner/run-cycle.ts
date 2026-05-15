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
import { recomputeWithPool } from "./recompute-pool";
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
import { triggerIncidentNotifications, triggerRegressionNotifications } from "@/libs/notification-triggers";
import { analyzeAdMessageMatch } from "../../workers/ingestion/enrichment/ad-message-match";
import { currencyFromLocale } from "../../packages/impact";
import { classifyPages, resolveFunnelModel, serializeStageDefinitions, scoreEdges, type PageForClassification, type SurfaceRelationForScoring } from "../../packages/classification";
import { computeFunnelGapInferences, type FunnelGapInput } from "../../packages/inference/funnel-gap-inference";
import { computeFormFlowInferences, type FormFlowInput } from "../../packages/inference/form-flow-inference";

export interface RunAuditCycleResult {
	cycleId: string;
	status: "complete" | "failed";
	pagesDiscovered: number;
	evidenceCount: number;
	durationMs: number;
	error?: string;
}

// Step-level transaction helpers. Each cycle step runs as one short
// transaction (chunked when batched) so a mid-write crash leaves the
// DB in a consistent state instead of half-written. The heal cron
// reads `AuditCycle.lastError` to know which step failed and whether
// to retry. Per-tx timeout is enforced at the connection level via
// Postgres `statement_timeout`; the array-form $transaction below
// doesn't accept a `timeout` option (only the callback form does).

async function stampCycleError(cycleId: string, step: string, err: unknown): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	try {
		await prisma.auditCycle.update({
			where: { id: cycleId },
			data: {
				lastError: `${step}: ${message}`.slice(0, 1000),
				lastErrorAt: new Date(),
				retryCount: { increment: 1 },
			},
		});
	} catch {
		// Stamping is best-effort — don't mask the original error by throwing here.
	}
}

function chunked<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

// Per-plan Playwright budget for ingestion. Kept tight on purpose:
// renders are the most expensive thing the pipeline does, and the
// long tail of "javascript-heavy" pages is large. Plans without a
// budget skip the renderer entirely (and we never pay the launch cost).
// Mirrors packages/plans/entitlements.ts → PLAN_LIMITS.playwright_budget.
function resolvePlaywrightBudget(plan: string | null | undefined): number {
	switch (plan) {
		case "max": return 20;
		case "pro": return 5;
		default: return 0;
	}
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

// ── Evidence index — built once per cycle, O(1) lookups per URL ──
interface EvidenceIndex {
	titleByUrl: Map<string, string>;
	statusByUrl: Map<string, number>;
	contentTypeByUrl: Map<string, string>;
	/** Wave 15.3 — http_response duration_ms by URL, for inventory aggregate. */
	durationMsByUrl: Map<string, number>;
}

function buildEvidenceIndex(evidence: Evidence[]): EvidenceIndex {
	const titleByUrl = new Map<string, string>();
	const statusByUrl = new Map<string, number>();
	const contentTypeByUrl = new Map<string, string>();
	// Wave 15.3 — extract duration_ms from http_response payloads so
	// PageInventoryItem.lastResponseTimeMs can be written at upsert time,
	// eliminating the per-request Evidence findMany in /api/inventory.
	const durationMsByUrl = new Map<string, number>();
	for (const ev of evidence) {
		const p = ev.payload as any;
		if (!p?.url) continue;
		if (ev.evidence_type === "page_content" && p.title && !titleByUrl.has(p.url)) {
			titleByUrl.set(p.url, String(p.title));
		} else if (ev.evidence_type === "http_response") {
			if (typeof p.status_code === "number" && !statusByUrl.has(p.url)) {
				statusByUrl.set(p.url, p.status_code);
			}
			const ct = p?.headers?.["content-type"] ?? p?.content_type;
			if (typeof ct === "string" && !contentTypeByUrl.has(p.url)) {
				contentTypeByUrl.set(p.url, ct.toLowerCase());
			}
			if (typeof p.duration_ms === "number" && p.duration_ms >= 0 && !durationMsByUrl.has(p.url)) {
				durationMsByUrl.set(p.url, Math.round(p.duration_ms));
			}
		}
	}
	return { titleByUrl, statusByUrl, contentTypeByUrl, durationMsByUrl };
}

// Backward-compat shims — prefer EvidenceIndex for hot loops.
function findTitleForUrl(evidence: Evidence[], url: string): string | null {
	for (const ev of evidence) {
		if (ev.evidence_type === "page_content") {
			const p = ev.payload as any;
			if (p?.url === url && p?.title) return String(p.title);
		}
	}
	return null;
}

function findStatusForUrl(evidence: Evidence[], url: string): number | null {
	for (const ev of evidence) {
		if (ev.evidence_type === "http_response") {
			const p = ev.payload as any;
			if (p?.url === url && typeof p?.status_code === "number") return p.status_code;
		}
	}
	return null;
}

function findContentTypeForUrl(evidence: Evidence[], url: string): string | null {
	for (const ev of evidence) {
		if (ev.evidence_type === "http_response") {
			const p = ev.payload as any;
			if (p?.url === url) {
				const ct = p?.headers?.["content-type"] ?? p?.content_type;
				if (typeof ct === "string") return ct.toLowerCase();
			}
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
				//
				// Wave 18b: also pull sessionCount30d so warm allow-list
				// prioritizes the rotation by real traffic instead of
				// pure-random shuffle. Customers without pixel events have
				// all values = 0 → degrades gracefully to random sampling.
				const inventoryRows = await prisma.pageInventoryItem
					.findMany({
						where: { environmentRef: env.id },
						select: { normalizedUrl: true, sessionCount30d: true },
						take: 500,
					})
					.catch(() => [] as Array<{ normalizedUrl: string; sessionCount30d: number }>);
				const inventoryUrls = inventoryRows.map((r) => ({
					url: canonicalizeUrl(r.normalizedUrl),
					sessionCount30d: r.sessionCount30d ?? 0,
				}));
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
					const urlsToCarry = inventoryUrls
						.filter((u) => !allowSet.has(u.url))
						.map((u) => u.url);
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
				exclude_patterns: (env as any).crawlExcludePatterns ?? [],
				// Playwright budget per cycle, scoped by org plan. Cold
				// cycles are the only mode where the renderer fires
				// (it's gated by mode='full' inside the pipeline too,
				// so a non-zero budget here is harmless for hot/warm).
				playwright_budget: pipelineMode === 'full' ? resolvePlaywrightBudget(cycle.organization?.plan) : 0,
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

		// Diagnostic: log enrichment pass status so we can see why
		// semantic enrichment skipped (LLM off? no evidence? mode?)
		console.log(`[audit-runner ${cycleId}] pipeline mode=${pipelineMode}, evidence=${evidenceCount}, LLM=${process.env.VESTIGIO_LLM_ENABLED === 'true'}, ANTHROPIC_KEY=${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'}`);
		const contentEv = result.evidence.filter((e: any) => e.evidence_type === 'page_content').length;
		const policyEv = result.evidence.filter((e: any) => e.evidence_type === 'policy_page').length;
		const enrichEv = result.evidence.filter((e: any) => e.evidence_type === 'content_enrichment').length;
		console.log(`[audit-runner ${cycleId}] page_content=${contentEv}, policy_page=${policyEv}, content_enrichment=${enrichEv}`);

		// 5. Persist evidence to Postgres
		try {
			const store = new PrismaEvidenceStore(prisma);
			await store.addMany(result.evidence);
		} catch (err) {
			console.error(`[audit-runner ${cycleId}] evidence persistence error:`, err);
			// Non-fatal — pipeline succeeded, just couldn't persist for warm restart.
		}

		// 6. Persist PageInventoryItem rows from coverage map
		// Build evidence index once for O(1) lookups in the upsert loop
		// (was O(N²) before — 3 full evidence scans per page).
		const evIdx = buildEvidenceIndex(result.evidence);

		// Build the upsert payloads once. Chunks of 50 keep each tx
		// short enough to stay under the 15s timeout even on cold-cache
		// Postgres connections, and small enough that a tx retry won't
		// stall the whole loop.
		const inventoryUpserts: Array<{ url: string; create: any; update: any }> = [];
		// Skip reasons that should NOT result in a persisted inventory
		// row. These are URLs we never actually attempted (excluded by
		// pattern, over the per-domain budget, or aborted) — persisting
		// them would bloat the inventory with thousands of sitemap URLs
		// on big sites and clutter the customer's view with pages they
		// either opted out of (excluded) or simply weren't budgeted.
		// Other skip reasons (loop_detected, challenge, asset, fetch_failed,
		// deduped, disallowed) DO get persisted so the customer can see
		// the audit trail of what we tried.
		const NON_PERSISTED_SKIP_REASONS = new Set(["excluded", "over_budget", "aborted"]);

		for (const entry of result.coverage_entries || []) {
			const url = entry.url;
			const skipReason: string | null = ((entry as any).skipReason as string | null) ?? null;
			if (skipReason && NON_PERSISTED_SKIP_REASONS.has(skipReason)) continue;

			const path = safePathname(url);
			const { pageType, tier } = inferPageType(path);
			const title = evIdx.titleByUrl.get(url) ?? null;
			// statusCode === null  → fetch never completed (timeout, DNS,
			// connection refused). We still persist the row so the user
			// sees it under "Not checked" — the failure is our fetcher's,
			// not the page being broken.
			// statusCode  >= 0    → fetch reached the server; whatever it
			// returned (200, 404, 500…) goes through.
			const statusCode = evIdx.statusByUrl.get(url) ?? null;

			const isFresh = statusCode !== null && entry.validated && statusCode < 400;
			const ct = evIdx.contentTypeByUrl.get(url) ?? null;
			const isAssetContent = ct !== null && !ct.includes("text/html");
			const finalPageType = isAssetContent ? "asset" : pageType;

			// Wave 9.3 — per-URL audit trail. discoverySource is sticky:
			// once we attribute "homepage_link", a later sitemap sighting
			// won't reattribute. skipReason flips between null (success)
			// and a tag (loop_detected / challenge / asset / fetch_failed
			// / deduped / disallowed). Reasons in NON_PERSISTED_SKIP_REASONS
			// never reach this line because of the early continue above.
			const discoverySource = (entry as any).discoverySource ?? null;
			const abTestPlatform = (entry as any).abTestPlatform ?? null;
			const localeCode = (entry as any).localeCode ?? null;
			const persistedSkipReason = isFresh ? null : skipReason;
			// Wave 15.3 — denormalized aggregate. Pull duration_ms from
			// the EvidenceIndex; falls back to undefined (no update) when
			// not present so we don't blow away a previous-cycle value.
			const responseTimeMs = evIdx.durationMsByUrl.get(url) ?? null;

			inventoryUpserts.push({
				url,
				create: {
					websiteRef: website.id,
					environmentRef: env.id,
					normalizedUrl: url,
					path,
					pageType: finalPageType,
					tier,
					priority: entry.critical ? 10 : 0,
					criticality: Math.round(entry.confidence ?? 0),
					title,
					statusCode,
					freshnessState: isFresh ? "fresh" : "stale",
					freshnessAge: isFresh ? 0 : null,
					lastSeenCycleId: isFresh ? cycleId : null,
					discoverySource,
					skipReason: persistedSkipReason,
					abTestPlatform,
					localeCode,
					lastResponseTimeMs: responseTimeMs,
					aggregatesUpdatedAt: responseTimeMs !== null ? new Date() : null,
				},
				update: {
					title: title ?? undefined,
					// Never overwrite a previously valid statusCode with
					// null — once we successfully checked a page, the
					// historical result is the truth until we re-verify
					// it. New non-null values always win.
					...(statusCode !== null ? { statusCode } : {}),
					freshnessState: isFresh ? "fresh" : "stale",
					freshnessAge: isFresh ? 0 : undefined,
					pageType: finalPageType,
					criticality: Math.round(entry.confidence ?? 0),
					...(isFresh ? { lastSeenCycleId: cycleId, removedAt: null } : {}),
					// Wave 15.3 — only update response_time when we actually
					// fetched it this cycle. Same logic as statusCode above.
					...(responseTimeMs !== null
						? { lastResponseTimeMs: responseTimeMs, aggregatesUpdatedAt: new Date() }
						: {}),
					// discoverySource is sticky — only set on create.
					// skipReason + abTestPlatform + localeCode refresh
					// every cycle so the UI reflects the most recent
					// state (an A/B test can be removed from a page
					// between cycles; a localized variant can have its
					// lang attribute fixed).
					skipReason: persistedSkipReason,
					abTestPlatform,
					localeCode,
				},
			});
		}

		for (const batch of chunked(inventoryUpserts, 50)) {
			try {
				const ops = batch.map((item) =>
					prisma.pageInventoryItem.upsert({
						where: {
							environmentRef_normalizedUrl: {
								environmentRef: env.id,
								normalizedUrl: item.url,
							},
						},
						create: item.create,
						update: item.update,
					}),
				);
				await prisma.$transaction(ops);
				pagesDiscovered += batch.length;
			} catch (err) {
				console.error(`[audit-runner ${cycleId}] inventory upsert tx failed (chunk size=${batch.length}):`, err);
				await stampCycleError(cycleId, "inventory_upsert", err);
				// Non-fatal: subsequent chunks still get a chance. Heal
				// cron retry will replay the cycle on next pass.
			}
		}

		// Inventory telemetry — operators need to know what happened.
		const totalEntries = (result.coverage_entries || []).length;
		const fetchedCount = (result.coverage_entries || []).filter(
			(e: any) => evIdx.statusByUrl.has(e.url),
		).length;
		const skippedCount = totalEntries - fetchedCount;
		const downCount = (result.coverage_entries || []).filter((e: any) => {
			const s = evIdx.statusByUrl.get(e.url);
			return s !== undefined && s >= 400;
		}).length;
		const assetCount = (result.coverage_entries || []).filter((e: any) => {
			const ct = evIdx.contentTypeByUrl.get(e.url);
			return ct && !ct.includes("text/html");
		}).length;
		const excludedCount = (result as any).excluded_urls ?? 0;
		const pwRenders = (result as any).playwright_renders ?? 0;
		const pwSkipped = (result as any).playwright_skipped_budget ?? 0;
		const pwAvgMs = (result as any).playwright_avg_ms ?? 0;
		console.log(
			`[audit-runner ${cycleId}] inventory: persisted=${pagesDiscovered} fetched=${fetchedCount}/${totalEntries} ` +
			`skipped=${skippedCount} 4xx_5xx=${downCount} assets=${assetCount} excluded=${excludedCount} ` +
			`playwright=${pwRenders}(skip=${pwSkipped},avg=${pwAvgMs}ms)`,
		);

		// 6a-maintenance: three post-upsert steps (aging, stale transition,
		// statusCode=0 cleanup, orphan-marking) run atomically so the
		// inventory view never reflects a partially-aged state.
		try {
			const cycleDurationSec = Math.round((Date.now() - new Date(cycle.createdAt).getTime()) / 1000);
			const updatedUrls = (result.coverage_entries || [])
				.filter((e: any) => evIdx.statusByUrl.has(e.url))
				.map((e: any) => e.url);
			const orphanThresholdSec = 14 * 24 * 60 * 60;

			const ops: any[] = [];
			if (cycleDurationSec > 0) {
				ops.push(prisma.pageInventoryItem.updateMany({
					where: { environmentRef: env.id, normalizedUrl: { notIn: updatedUrls } },
					data: { freshnessAge: { increment: cycleDurationSec } },
				}));
				ops.push(prisma.pageInventoryItem.updateMany({
					where: {
						environmentRef: env.id,
						freshnessAge: { gt: 7 * 24 * 60 * 60 },
						freshnessState: "fresh",
					},
					data: { freshnessState: "stale" },
				}));
			}
			ops.push(prisma.pageInventoryItem.deleteMany({
				where: { environmentRef: env.id, statusCode: 0 },
			}));
			ops.push(prisma.pageInventoryItem.updateMany({
				where: {
					environmentRef: env.id,
					lastSeenCycleId: { not: cycleId },
					freshnessAge: { gt: orphanThresholdSec },
					removedAt: null,
				},
				data: { removedAt: new Date() },
			}));

			const results = await prisma.$transaction(ops);
			// Last two results are statusCode-0 cleanup + orphan-marking
			// counts (positions depend on whether aging ran). Pluck by tail.
			const orphanResult = results[results.length - 1] as { count: number } | undefined;
			const cleanedResult = results[results.length - 2] as { count: number } | undefined;
			if (cleanedResult?.count) {
				console.log(`[audit-runner ${cycleId}] cleaned ${cleanedResult.count} inventory rows with statusCode=0`);
			}
			if (orphanResult?.count) {
				console.log(`[audit-runner ${cycleId}] orphan-marked ${orphanResult.count} rows (not seen in >14d)`);
			}
		} catch (err) {
			console.warn(`[audit-runner ${cycleId}] inventory maintenance tx failed:`, err);
			await stampCycleError(cycleId, "inventory_maintenance", err);
		}

		// 6b. Persist SurfaceRelation records from crawled link graph.
		// Uses createMany + skipDuplicates for single-query batch insert.
		if (result.surface_relations && result.surface_relations.length > 0) {
			const relDedup = new Set<string>();
			const batchData: Array<{
				websiteRef: string; sourceUrl: string; targetUrl: string;
				relationType: string; sourceHost: string; targetHost: string;
				isSameDomain: boolean; confidence: number; cycleRef: string; metadata: string;
			}> = [];
			for (const rel of result.surface_relations) {
				const key = `${rel.sourceUrl}|${rel.targetUrl}|${rel.relationType}`;
				if (relDedup.has(key)) continue;
				relDedup.add(key);
				batchData.push({
					websiteRef: website.id,
					sourceUrl: rel.sourceUrl,
					targetUrl: rel.targetUrl,
					relationType: rel.relationType,
					sourceHost: rel.sourceHost,
					targetHost: rel.targetHost,
					isSameDomain: rel.isSameDomain,
					confidence: 1.0,
					cycleRef: cycleId,
					metadata: JSON.stringify({ linkText: rel.linkText ?? null, position: rel.position ?? 'unknown' }),
				});
			}
			try {
				const result2 = await prisma.surfaceRelation.createMany({ data: batchData, skipDuplicates: true });
				console.log(`[audit-runner ${cycleId}] surface relations persisted: ${result2.count} (from ${batchData.length} deduped, ${result.surface_relations.length} raw)`);
			} catch (err) {
				console.error(`[audit-runner ${cycleId}] surface relation batch error:`, err);
			}
		}

		// 6c. Multi-signal page classification (User Journey Intelligence Layer).
		// Uses evidence from the pipeline to classify pages more accurately
		// than pathname regex alone. Writes classifiedPageType + confidence
		// to PageInventoryItem for journey map + engine consumption.
		let classifiedPageMap = new Map<string, string>();
		try {
			// Build page context from evidence
			const pageContexts: PageForClassification[] = [];
			const pageContentByUrl = new Map<string, { title: string | null; h1: string | null; metaDescription: string | null; hasForms: boolean; formCount: number; bodyWordCount: number }>();

			for (const ev of result.evidence) {
				if (ev.evidence_type === 'page_content') {
					const p = ev.payload as any;
					if (p?.url) {
						pageContentByUrl.set(p.url, {
							title: p.title || null,
							h1: p.h1 || null,
							metaDescription: p.meta_description || null,
							hasForms: p.has_forms ?? false,
							formCount: p.form_count ?? 0,
							bodyWordCount: p.body_word_count ?? 0,
						});
					}
				}
			}

			// Build classification input for each page in inventory
			for (const entry of result.coverage_entries || []) {
				if (!entry.validated) continue;
				const url = entry.url;
				const path = safePathname(url);
				const content = pageContentByUrl.get(url);
				const { pageType } = inferPageType(path);

				pageContexts.push({
					url,
					path,
					title: content?.title ?? null,
					h1: content?.h1 ?? null,
					metaDescription: content?.metaDescription ?? null,
					hasForms: content?.hasForms ?? false,
					formCount: content?.formCount ?? 0,
					bodyWordCount: content?.bodyWordCount ?? 0,
					existingPageType: pageType,
				});
			}

			// Resolve business model (prefer explicitly loaded profile over navigation)
			const businessModel = businessProfileForPipeline?.businessModel
				|| result.classification?.primary_model
				|| null;

			// Run multi-signal classification
			const classifications = classifyPages(pageContexts, result.evidence, businessModel);

			// Persist classifications (batched to avoid N+1)
			const classificationOps = [...classifications].map(([url, classification]) =>
				prisma.pageInventoryItem.updateMany({
					where: { environmentRef: env.id, normalizedUrl: url },
					data: {
						classifiedPageType: classification.classifiedPageType,
						classificationConfidence: classification.classificationConfidence,
						classificationSignals: JSON.stringify(classification.classificationSignals),
					},
				})
			);
			// Execute in chunks of 50 to avoid overwhelming connection pool.
			// Track rejections explicitly so partial failures are visible
			// instead of silently dropping rows. If more than half the
			// chunks fail, stamp the cycle so heal/admin debugging can see
			// where it broke instead of just "cycle marked complete with
			// fewer-classifications-than-expected".
			let classifiedCount = 0;
			let rejectedCount = 0;
			let firstRejection: unknown = null;
			for (let i = 0; i < classificationOps.length; i += 50) {
				const chunk = classificationOps.slice(i, i + 50);
				const results = await Promise.allSettled(chunk);
				for (const r of results) {
					if (r.status === 'fulfilled') {
						classifiedCount++;
					} else {
						rejectedCount++;
						if (firstRejection === null) firstRejection = r.reason;
					}
				}
			}

			if (rejectedCount > 0) {
				console.warn(`[audit-runner ${cycleId}] classification: ${rejectedCount} rows rejected (first reason: ${firstRejection instanceof Error ? firstRejection.message : String(firstRejection)})`);
				// Systemic failure (>50% rejected) deserves a stamped
				// cycle error — looks like a schema/connection issue
				// rather than a one-off row problem.
				if (classificationOps.length > 0 && rejectedCount * 2 > classificationOps.length) {
					await stampCycleError(cycleId, "classification_persist", firstRejection ?? new Error(`${rejectedCount} classification rows rejected`));
				}
			}
			console.log(`[audit-runner ${cycleId}] page classification: ${classifiedCount} pages classified, ${rejectedCount} rejected (business_model=${businessModel || 'inferred'})`);

			// Build URL→pageType map for funnel-moment inference engine
			for (const [url, cls] of classifications) {
				classifiedPageMap.set(url, cls.classifiedPageType);
			}

			// 6d. Resolve and persist funnel model.
			const classifiedTypes = new Set(
				[...classifications.values()].map(c => c.classifiedPageType)
			);
			const funnelModel = resolveFunnelModel(businessModel, result.classification?.primary_model, classifiedTypes as any);

			await prisma.funnelModel.upsert({
				where: { environmentRef: env.id },
				create: {
					environmentRef: env.id,
					modelType: funnelModel.modelType,
					stageDefinitions: serializeStageDefinitions(funnelModel.stages),
					isAutoDetected: true,
				},
				update: {
					modelType: funnelModel.modelType,
					stageDefinitions: serializeStageDefinitions(funnelModel.stages),
					isAutoDetected: true,
				},
			});

			console.log(`[audit-runner ${cycleId}] funnel model: ${funnelModel.modelType} (${funnelModel.stages.length} stages)`);

			// 6e. Score edges for link intent classification.
			if (result.surface_relations && result.surface_relations.length > 0) {
				const relationsForScoring: SurfaceRelationForScoring[] = result.surface_relations.map(rel => ({
					sourceUrl: rel.sourceUrl,
					targetUrl: rel.targetUrl,
					relationType: rel.relationType,
					linkText: rel.linkText ?? null,
					position: (rel.position as any) ?? undefined,
					targetPageType: classifications.get(rel.targetUrl)?.classifiedPageType ?? null,
				}));

				// Use distinct source URLs as denominator (not pageContexts which only counts validated entries)
				const totalSourcePages = new Set(result.surface_relations.map(r => r.sourceUrl)).size;
				const edgeScores = scoreEdges(relationsForScoring, Math.max(totalSourcePages, 1));

				// Update SurfaceRelation metadata with scores (batched)
				const scoreOps = [...edgeScores]
					.filter(([, score]) => score.linkWeight >= 0.1)
					.map(([key, score]) => {
						const [sourceUrl, targetUrl] = key.split('|');
						return prisma.surfaceRelation.updateMany({
							where: { websiteRef: website.id, sourceUrl, targetUrl },
							data: { metadata: JSON.stringify(score) },
						});
					});
				let scoredCount = 0;
				let scoreRejected = 0;
				let firstScoreRejection: unknown = null;
				for (let i = 0; i < scoreOps.length; i += 50) {
					const chunk = scoreOps.slice(i, i + 50);
					const results = await Promise.allSettled(chunk);
					for (const r of results) {
						if (r.status === 'fulfilled') scoredCount++;
						else {
							scoreRejected++;
							if (firstScoreRejection === null) firstScoreRejection = r.reason;
						}
					}
				}
				if (scoreRejected > 0) {
					console.warn(`[audit-runner ${cycleId}] edge scoring: ${scoreRejected} rows rejected (first reason: ${firstScoreRejection instanceof Error ? firstScoreRejection.message : String(firstScoreRejection)})`);
					if (scoreOps.length > 0 && scoreRejected * 2 > scoreOps.length) {
						await stampCycleError(cycleId, "edge_score_persist", firstScoreRejection ?? new Error(`${scoreRejected} edge score rows rejected`));
					}
				}
				console.log(`[audit-runner ${cycleId}] edge scoring: ${scoredCount} edges scored, ${scoreRejected} rejected`);
			}
		} catch (err) {
			// The classification block crashed BEFORE the chunked persist
			// loop finished — stamp the cycle so partial state is visible.
			// Still "non-fatal" in the sense that we continue with engine
			// + findings, but the lastError lets ops see what failed.
			console.error(`[audit-runner ${cycleId}] classification/funnel error (non-fatal but stamped):`, err);
			await stampCycleError(cycleId, "classification_funnel", err);
		}

		// 6f. Compute funnel-gap inferences (structural journey analysis).
		// Runs after classification + edge scoring so it has all the data.
		let funnelGapInferences: import("../../packages/inference/funnel-gap-inference").FunnelGapInput extends never ? never : ReturnType<typeof computeFunnelGapInferences> = { signals: [], inferences: [] };
		try {
			const funnelModelForGap = await prisma.funnelModel.findUnique({ where: { environmentRef: env.id } });
			if (funnelModelForGap) {
				const stages = JSON.parse(funnelModelForGap.stageDefinitions);
				const classifiedPages = await prisma.pageInventoryItem.findMany({
					where: { environmentRef: env.id, classifiedPageType: { not: null } },
					select: { normalizedUrl: true, path: true, classifiedPageType: true, title: true },
				});
				const scoredRelations = await prisma.surfaceRelation.findMany({
					where: { websiteRef: website.id },
					select: { sourceUrl: true, targetUrl: true, metadata: true },
				});

				const gapInput: FunnelGapInput = {
					pages: classifiedPages.map(p => ({
						url: p.normalizedUrl,
						path: p.path,
						classifiedPageType: p.classifiedPageType!,
						title: p.title,
					})),
					relations: scoredRelations.map(r => {
						let weight = 0.5;
						let intent = 'body_contextual';
						try {
							const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
							if (meta?.linkWeight != null) weight = meta.linkWeight;
							if (meta?.linkIntent) intent = meta.linkIntent;
						} catch {}
						return { sourceUrl: r.sourceUrl, targetUrl: r.targetUrl, linkWeight: weight, linkIntent: intent };
					}),
					stages,
					modelType: funnelModelForGap.modelType,
					scoping: {
						workspace_ref: `org:${cycle.organizationId}`,
						environment_ref: env.id,
						subject_ref: `website:${website.id}`,
						path_scope: null,
					},
					cycleRef: cycleId,
				};

				funnelGapInferences = computeFunnelGapInferences(gapInput);
				console.log(`[audit-runner ${cycleId}] funnel-gap findings: ${funnelGapInferences.inferences.length}`);
			}
		} catch (err) {
			console.error(`[audit-runner ${cycleId}] funnel-gap inference error (non-fatal):`, err);
		}

		// 6f-2. Form Flow inference (Fase A — static). Builds the form
		// graph from Form evidence + form_action relations and surfaces
		// multi-step checkout friction, external handoffs, and field
		// overload findings. Fase B (dynamic submission via Playwright)
		// is documented in docs/FORM_FLOW_PHASE_B.md.
		let formFlowInferences: { signals: any[]; inferences: any[] } = { signals: [], inferences: [] };
		try {
			const formEvidencePayloads = (result.evidence || [])
				.filter((e: any) => e.evidence_type === 'form')
				.map((e: any) => {
					const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
					return {
						page_url: p?.page_url ?? '',
						action: p?.action ?? '',
						method: p?.method ?? 'get',
						target_host: p?.target_host ?? null,
						is_external: !!p?.is_external,
						field_names: Array.isArray(p?.field_names) ? p.field_names : [],
						has_payment_fields: !!p?.has_payment_fields,
					};
				})
				.filter((f: any) => f.page_url);

			if (formEvidencePayloads.length > 0) {
				const formActionRelations = (result.surface_relations || [])
					.filter((r: any) => r.relationType === 'form_action')
					.map((r: any) => ({
						sourceUrl: r.sourceUrl,
						targetUrl: r.targetUrl,
						sourceHost: r.sourceHost,
						targetHost: r.targetHost,
						isSameDomain: r.isSameDomain,
					}));

				const ctaRelations = (result.surface_relations || [])
					.filter((r: any) => r.relationType === 'anchor' && r.isSameDomain)
					.map((r: any) => ({ sourceUrl: r.sourceUrl, targetUrl: r.targetUrl }));

				const pagesForFlow = await prisma.pageInventoryItem.findMany({
					where: { environmentRef: env.id, removedAt: null },
					select: { normalizedUrl: true, path: true, classifiedPageType: true },
				});

				const flowInput: FormFlowInput = {
					formEvidence: formEvidencePayloads,
					formActionRelations,
					ctaRelations,
					pages: pagesForFlow.map(p => ({
						url: p.normalizedUrl,
						path: p.path,
						classifiedPageType: p.classifiedPageType,
					})),
					rootDomain: domain,
					scoping: {
						workspace_ref: `org:${cycle.organizationId}`,
						environment_ref: env.id,
						subject_ref: `website:${website.id}`,
						path_scope: null,
					},
					cycleRef: cycleId,
				};

				formFlowInferences = computeFormFlowInferences(flowInput);
				console.log(`[audit-runner ${cycleId}] form-flow findings: ${formFlowInferences.inferences.length}`);
			}
		} catch (err) {
			console.error(`[audit-runner ${cycleId}] form-flow inference error (non-fatal):`, err);
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
		let changeReportForNotifications: any = null;
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
			// Resolve org locale for engine translations.
			// Single source of truth: Organization.locale > owner User.locale > English.
			let translations;
			try {
				const orgLocale = (cycle.organization as any).locale;
				if (orgLocale) {
					translations = loadEngineTranslationsForLocale(orgLocale);
				} else {
					// Fallback: owner's locale (legacy path for orgs without locale set)
					const owner = await prisma.user.findUnique({
						where: { id: cycle.organization.ownerId },
						select: { locale: true },
					});
					translations = loadEngineTranslationsForLocale(owner?.locale);
				}
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

			// (b-static) Run static checks for supplementary signals
			let staticCheckSignals: import("../../packages/domain").Signal[] = [];
			try {
				const { runStaticChecks } = await import("../../workers/ingestion/stages/static-checks");
				staticCheckSignals = await runStaticChecks({
					evidence: result.evidence,
					rootDomain: domain,
					scoping: {
						workspace_ref: workspaceRef,
						environment_ref: environmentRef,
						subject_ref: `website:${website.id}`,
						path_scope: null,
					},
					cycle_ref: `audit_cycle:${cycleId}`,
				});
				console.log(`[audit-runner ${cycleId}] static checks: ${staticCheckSignals.length} signals`);
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] static checks failed (non-fatal):`, err);
			}

			// (b) Engine
			// Resolve currency: org.currency > derived from org.locale > USD
			let resolvedCurrency = 'USD';
			try {
				const orgCurrency = (cycle.organization as any).currency;
				if (orgCurrency) {
					resolvedCurrency = orgCurrency;
				} else {
					const orgLocale = (cycle.organization as any).locale;
					resolvedCurrency = currencyFromLocale(orgLocale);
				}
			} catch {
				// Fallback to USD on any resolution error
			}

			// Build funnel stage multipliers from classified pages.
			// Deeper funnel stages get higher multipliers.
			const STAGE_MULTIPLIERS: Record<number, number> = {
				0: 1.0,  // awareness (homepage/landing)
				1: 1.3,  // consideration (features/category)
				2: 1.8,  // evaluation/decision (pricing/demo)
				3: 2.5,  // conversion (checkout/signup/cart)
				4: 1.2,  // activation/retention (onboarding/account)
			};

			let funnelMultipliers: import("../../packages/impact").FunnelStageMultipliers | undefined;
			try {
				const funnelModelForEngine = await prisma.funnelModel.findUnique({ where: { environmentRef: env.id } });
				if (funnelModelForEngine) {
					const stages = JSON.parse(funnelModelForEngine.stageDefinitions) as Array<{ order: number; pageTypes: string[] }>;
					const classifiedPages = await prisma.pageInventoryItem.findMany({
						where: { environmentRef: env.id, classifiedPageType: { not: null } },
						select: { path: true, normalizedUrl: true, classifiedPageType: true },
					});

					const byPath = new Map<string, number>();
					for (const page of classifiedPages) {
						const stage = stages.find(s => s.pageTypes.includes(page.classifiedPageType!));
						if (stage) {
							const mult = STAGE_MULTIPLIERS[stage.order] ?? 1.0;
							byPath.set(page.path, mult);
							byPath.set(page.normalizedUrl, mult);
							// Also index by pathname portion of URL for signal_ref matching
							try { byPath.set(new URL(page.normalizedUrl).pathname, mult); } catch {}
						}
					}
					if (byPath.size > 0) {
						funnelMultipliers = { byPath, default: 1.0 };
					}
				}
			} catch {
				// Non-fatal — proceed without funnel multipliers
			}

			const recomputeStartMs = Date.now();
			// Recompute offload. When RECOMPUTE_USE_WORKER_THREADS=1 the
			// engine runs on its own V8 isolate via worker_threads (true
			// CPU parallelism between concurrent cycles); otherwise it
			// falls back to the in-process generator drainer (event-loop
			// yields between phases). Both produce identical output.
			const multiPackResult = await recomputeWithPool({
				evidence: result.evidence,
				additional_signals: staticCheckSignals,
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
				currency: resolvedCurrency,
				funnel_multipliers: funnelMultipliers,
				additional_inferences: (() => {
					const merged = [
						...(funnelGapInferences.inferences || []),
						...(formFlowInferences.inferences || []),
					];
					return merged.length > 0 ? merged : undefined;
				})(),
				classified_pages: classifiedPageMap.size > 0 ? classifiedPageMap : undefined,
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
						// Wave 7.2: Extract per-cycle revenue from integration snapshots
						// for cross-cycle revenue correlation in the Revenue Recovery Tracker.
						const revenueData = extractRevenueFromIntegrations(integrationSnapshots);
						await snapshotStore.asyncSave(
							multiPackResult.current_snapshot,
							cycleId,
							tx,
							revenueData,
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

					// Wave 16 — serialize ProjectionResult (findings, actions,
					// workspaces, change_report, maps) into the cycle row so
					// page loads can skip recomputeAll() entirely. Caps total
					// JSON size at ~10MB by trimming maps (which embed nodes
					// + edges that can blow up for dense graphs). Done inside
					// the transaction so cache + cycle status flip together —
					// no chance of "complete cycle with stale cache."
					const { buildAllMaps } = await import("../../packages/maps");
					const maps = buildAllMaps(projections, multiPackResult, translations);
					const cachePayload = {
						findings: projections.findings,
						actions: projections.actions,
						workspaces: projections.workspaces,
						change_report: projections.change_report,
						maps,
						coherence_score: projections.coherence_score,
						system_health: projections.system_health,
						cached_at: new Date().toISOString(),
						cycle_ref: cycleRefStr,
					};

					await tx.auditCycle.update({
						where: { id: cycleId },
						data: {
							status: "complete",
							completedAt: new Date(),
							projectionsCache: cachePayload as any,
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
			changeReportForNotifications = projections.change_report;

			// Wave 15.3 — denormalize findingCount per page from the just-
			// persisted findings. Replaces the per-request groupBy in
			// /api/inventory with a single bulk update right after the
			// findings are written. Best-effort: failure logs but doesn't
			// fail the cycle (inventory falls back to 0 on null aggregates).
			try {
				const findingCountBySurface = new Map<string, number>();
				for (const f of projections.findings) {
					// Mirror the polarity filter used by the old groupBy.
					if (f.polarity === 'positive') continue;
					const surface = f.surface;
					if (!surface) continue;
					findingCountBySurface.set(surface, (findingCountBySurface.get(surface) ?? 0) + 1);
				}
				const now = new Date();
				// Reset all rows for this env to 0, then bump matched ones.
				// Two updateMany calls is dramatically cheaper than per-row
				// upserts when most pages stay at 0.
				await prisma.pageInventoryItem.updateMany({
					where: { environmentRef: env.id },
					data: { findingCount: 0 },
				});
				for (const [surface, count] of findingCountBySurface) {
					await prisma.pageInventoryItem.updateMany({
						where: { environmentRef: env.id, normalizedUrl: surface },
						data: { findingCount: count, aggregatesUpdatedAt: now },
					});
				}
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] findingCount denorm failed:`, err);
			}

			// Wave 15.3 — denormalize sessionCount30d via single GROUP BY on
			// RawBehavioralEvent, then bulk update. Same idea: replace the
			// per-request scan in /api/inventory with one query at audit
			// complete time. The 30-day window matches the old API filter.
			try {
				const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
				const rows = await prisma.$queryRaw<Array<{ url: string; session_count: number }>>`
					SELECT url, COUNT(DISTINCT "sessionId")::int AS session_count
					FROM "RawBehavioralEvent"
					WHERE "envId" = ${env.id}
						AND "occurredAt" >= ${thirtyDaysAgo}
					GROUP BY url
				`;
				const now = new Date();
				// Reset env-wide to 0 first so deleted/inactive URLs don't
				// keep stale counts.
				await prisma.pageInventoryItem.updateMany({
					where: { environmentRef: env.id },
					data: { sessionCount30d: 0 },
				});
				for (const row of rows) {
					await prisma.pageInventoryItem.updateMany({
						where: { environmentRef: env.id, normalizedUrl: row.url },
						data: { sessionCount30d: Number(row.session_count), aggregatesUpdatedAt: now },
					});
				}
			} catch (err) {
				console.warn(`[audit-runner ${cycleId}] sessionCount30d denorm failed:`, err);
			}

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

		// (e2b) Trigger regression notifications for material regressions
		// from the change report — best-effort, same pattern as incidents.
		if (changeReportForNotifications?.regressions?.length > 0) {
			const materialRegressions = changeReportForNotifications.regressions.filter(
				(r: any) => r.change_severity === "significant" || r.change_severity === "critical",
			);
			if (materialRegressions.length > 0) {
				try {
					await triggerRegressionNotifications({
						userId: cycle.organization.ownerId,
						domain: env.domain,
						regressions: materialRegressions.map((r: any) => ({
							id: r.decision_key,
							title: r.title,
							severity: r.current_severity || r.change_severity,
							change_class: r.change_class,
							impact: r.risk_score_delta ? { midpoint: Math.abs(r.risk_score_delta) } : undefined,
							root_cause: r.contributing_factors?.join(", ") || null,
						})),
					});
				} catch {
					// Non-fatal: notification failure shouldn't block the audit
				}
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

		// Prune findings from old cycles — keep only the 2 most recent.
		// Without this, findings accumulate across cycles causing duplicates
		// in the UI and inflated counts in workspace perspectives.
		try {
			const { PrismaFindingStore } = await import("../../packages/projections");
			const findingStore = new PrismaFindingStore(prisma);
			const pruned = await findingStore.pruneOlderThan(env.id, 2);
			if (pruned > 0) {
				console.log(`[audit-runner ${cycleId}] pruned ${pruned} findings from old cycles`);
			}
		} catch (err) {
			console.warn(`[audit-runner ${cycleId}] finding prune failed:`, err);
		}

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

// ──────────────────────────────────────────────
// Wave 7.2: Extract per-cycle revenue from integration snapshots
// ──────────────────────────────────────────────

function extractRevenueFromIntegrations(
	snapshots: IntegrationSnapshot[],
): { cents: number; source: string } | null {
	// Priority: Stripe > Shopify > Nuvemshop (SaaS MRR is more authoritative than order revenue)
	const stripe = snapshots.find(s => s.provider === 'stripe');
	if (stripe && 'revenue' in stripe.data) {
		const data = stripe.data as { revenue: { total: number }; mrr: number | null };
		// Use MRR for SaaS if available, otherwise total revenue
		const revenueCents = data.mrr != null
			? Math.round(data.mrr * 100)
			: Math.round(data.revenue.total * 100);
		if (revenueCents > 0) return { cents: revenueCents, source: 'stripe' };
	}

	const shopify = snapshots.find(s => s.provider === 'shopify');
	if (shopify && 'revenue' in shopify.data) {
		const data = shopify.data as { revenue: { total: number } };
		const revenueCents = Math.round(data.revenue.total * 100);
		if (revenueCents > 0) return { cents: revenueCents, source: 'shopify' };
	}

	const nuvemshop = snapshots.find(s => s.provider === 'nuvemshop');
	if (nuvemshop && 'revenue' in nuvemshop.data) {
		const data = nuvemshop.data as { revenue: { total: number } };
		const revenueCents = Math.round(data.revenue.total * 100);
		if (revenueCents > 0) return { cents: revenueCents, source: 'nuvemshop' };
	}

	return null;
}
