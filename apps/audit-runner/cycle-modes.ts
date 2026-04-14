import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Cycle modes  (Wave 5 Fase 3)
//
// All the incremental-vs-full intelligence lives here so run-cycle.ts
// stays focused on orchestration. Three jobs:
//
//   1. Classify an env's URLs into a "critical surface" set (revenue-
//      driving pages: checkout, pricing, product, home, plus any
//      surface with a recent high/critical finding). Used by the
//      scheduler + runner to decide what a `hot` sweep covers.
//
//   2. Build a URL allow-list for the current cycleType (hot sweeps
//      only the critical set; warm sweeps critical + a rotating
//      sample of the rest; cold sweeps everything).
//
//   3. Carry evidence forward from the previous cycle when the page's
//      content hash hasn't changed. This is the real incremental win
//      — skipping parse + signal extraction for an unchanged page
//      while still having that page's evidence in the recompute set.
//
// Why this design: the engine's recomputeAll() is atomic over the
// evidence set (no delta path today, and adding one would be a
// cross-cutting refactor). Instead of building a delta path, we make
// the evidence set itself selectively incremental — unchanged pages
// appear via carry-forward rows with refreshed observed_at; changed
// pages appear as freshly-parsed rows. Engine output is identical
// shape-wise, so downstream change-detection, projections, and
// findings persistence keep working unchanged.
// ──────────────────────────────────────────────

export type CycleMode = "hot" | "warm" | "cold";

export interface CycleModeConfig {
	/** Behavioral session lookback in hours. Hot uses a short window
	 *  (last hour) so we surface fresh friction quickly; cold uses
	 *  the full 30d baseline. */
	behavioralWindowHours: number;
	/** Minimum session count per cohort before behavioral inferences
	 *  are allowed to fire. Hot cycles have fewer sessions in-window,
	 *  so we lower the bar (but not to zero — noise still matters). */
	minSessionsForInferences: number;
	/** Hard wall-clock budget for the cycle. Hot cycles must complete
	 *  fast so Max-tier 15min-cadence doesn't pile up. Cold can take
	 *  the full pipeline budget. Milliseconds. */
	cycleBudgetMs: number;
	/** Whether to disable evidence carry-forward. Cold cycles always
	 *  re-parse (baseline reset); hot/warm carry forward when hash
	 *  matches. */
	disableCarryForward: boolean;
}

export const CYCLE_MODE_CONFIG: Record<CycleMode, CycleModeConfig> = {
	hot: {
		behavioralWindowHours: 1,
		minSessionsForInferences: 5,
		cycleBudgetMs: 60_000,
		disableCarryForward: false,
	},
	warm: {
		behavioralWindowHours: 24,
		minSessionsForInferences: 10,
		cycleBudgetMs: 4 * 60_000,
		disableCarryForward: false,
	},
	cold: {
		behavioralWindowHours: 24 * 30,
		minSessionsForInferences: 20,
		cycleBudgetMs: 10 * 60_000,
		disableCarryForward: true,
	},
};

// ──────────────────────────────────────────────
// Critical surface classification
// ──────────────────────────────────────────────

/**
 * Regex patterns that identify revenue-critical surfaces automatically.
 * Intentionally NOT user-configurable at this stage — the value of
 * critical-surface selection comes from being consistent across the
 * product, and a misconfigured override on a real customer would cause
 * silent drift. Users marking custom pages is future work (see
 * ROADMAP Wave 5 notes); the heuristic here catches the 95th
 * percentile of e-commerce and SaaS patterns.
 *
 * Ordering matters — first match wins, so checkout takes priority
 * over product, product over pricing, etc.
 */
const CRITICAL_SURFACE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /\/(checkout|cart|carrinho|comprar|pay|payment|billing)/i, label: "checkout" },
	{ pattern: /\/(pricing|preco|planos|plans)/i, label: "pricing" },
	{ pattern: /\/(product|produto|item|p\/)/i, label: "product" },
];

/**
 * Does the URL match a revenue-critical pattern or is it the landing
 * page? Called by the runner + scheduler to build the hot allow-list.
 */
export function isCriticalSurfaceUrl(url: string): boolean {
	let path: string;
	try {
		path = new URL(url).pathname || "/";
	} catch {
		return false;
	}
	// Landing page (home) is always critical — it's the most-visited
	// surface and regressions here hit every downstream funnel.
	if (path === "/" || path === "") return true;
	return CRITICAL_SURFACE_PATTERNS.some((p) => p.pattern.test(path));
}

/**
 * Resolve the FULL critical-surface set for an environment by combining:
 *   (a) URLs that match the regex heuristic above, AND
 *   (b) URLs that have had at least one severity>=high finding land
 *       within the last 7 days (automatic promotion — a page that's
 *       actively breaking revenue gets hot-swept until it's fixed).
 *
 * The DB queries here are small and indexed (by environmentRef).
 */
export async function resolveCriticalSurfaces(
	prisma: PrismaClient,
	environmentId: string,
): Promise<Set<string>> {
	const out = new Set<string>();
	try {
		const inventory = await prisma.pageInventoryItem.findMany({
			where: { environmentRef: environmentId },
			select: { normalizedUrl: true },
			take: 500, // long-tail sites don't need more — the rotation
			           // will catch them via warm sweeps
		});
		for (const row of inventory) {
			if (isCriticalSurfaceUrl(row.normalizedUrl)) {
				out.add(row.normalizedUrl);
			}
		}
	} catch {
		// best-effort — returning an empty set means hot becomes a no-op
		// which is safer than crashing the scheduler
	}

	// Promote recent high-severity findings to hot. The Finding.surface
	// column stores the path (e.g. "/checkout") — not a full URL. We
	// resolve to a full URL by prefixing with the env's landing domain
	// so the allow-list comparison matches what the crawler emits.
	try {
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const env = await prisma.environment.findUnique({
			where: { id: environmentId },
			select: { landingUrl: true, domain: true },
		});
		const origin = env?.landingUrl
			? new URL(env.landingUrl).origin
			: env?.domain
				? `https://${env.domain}`
				: null;

		const recentCritical = await prisma.finding.findMany({
			where: {
				environmentId,
				severity: { in: ["critical", "high"] },
				createdAt: { gte: sevenDaysAgo },
			},
			select: { surface: true },
			distinct: ["surface"],
			take: 50,
		});
		for (const f of recentCritical) {
			if (!f.surface) continue;
			// Surface may already be a full URL or just a path. Handle both.
			const fullUrl = f.surface.startsWith("http")
				? f.surface
				: origin
					? `${origin}${f.surface.startsWith("/") ? "" : "/"}${f.surface}`
					: null;
			if (fullUrl) out.add(fullUrl);
		}
	} catch {
		// ignore — just won't auto-promote
	}

	return out;
}

/**
 * Build the URL allow-list for a cycle. Hot: only critical. Warm: all
 * critical PLUS a rotating sample of the rest, where the sample size
 * is roughly `ratio * totalNonCritical` (defaults to 30%). Cold: null
 * (all pages crawled).
 *
 * The warm rotation is intentionally stateless (random sample per
 * cycle) for the first pass — good enough to provide warm guarantee
 * across ~4 warm cycles on a medium-size site. A deterministic
 * round-robin rotation with a persistence cursor is a future
 * refinement if we see drift in warm coverage.
 */
export interface AllowListInput {
	mode: CycleMode;
	critical: Set<string>;
	allInventoryUrls: string[];
	warmSampleRatio?: number; // default 0.3
}

export function buildUrlAllowList(input: AllowListInput): string[] | null {
	if (input.mode === "cold") return null;

	const criticalList = Array.from(input.critical);
	if (input.mode === "hot") return criticalList;

	// warm: critical + random sample
	const nonCritical = input.allInventoryUrls.filter(
		(u) => !input.critical.has(u),
	);
	const ratio = input.warmSampleRatio ?? 0.3;
	const sampleSize = Math.max(1, Math.floor(nonCritical.length * ratio));
	// Fisher-Yates-lite: shuffle and take — the sample is small (~dozens)
	// so a full shuffle isn't worth the allocation. slice+sort+take is
	// O(n log n) but n is bounded by inventory.take=500.
	const shuffled = [...nonCritical].sort(() => Math.random() - 0.5);
	const sample = shuffled.slice(0, sampleSize);
	return [...criticalList, ...sample];
}

// ──────────────────────────────────────────────
// Evidence carry-forward
// ──────────────────────────────────────────────

/**
 * Result of the carry-forward pass. Returned so the runner can log
 * what happened + decide which URLs still need fresh crawling.
 */
export interface CarryForwardResult {
	/** URLs whose previous-cycle evidence was successfully copied forward
	 *  (hash matched, no need to re-crawl). */
	carriedUrls: string[];
	/** URLs that weren't in the previous cycle or whose hash is unknown
	 *  — these still need a fresh crawl. */
	uncoveredUrls: string[];
	/** Number of evidence rows cloned from the previous cycle. */
	rowsCarried: number;
}

/**
 * For each URL in `candidateUrls`, look up the previous cycle's
 * HttpResponse evidence; if the hash matches what we recently fetched
 * (caller's responsibility — see runIncremental()) we copy ALL evidence
 * rows for that URL from the previous cycle into the new one with
 * refreshed observed_at and a "reused" collectionMethod marker.
 *
 * Important: this function ONLY does the cloning. The caller decides
 * which URLs are reuse candidates (by checking the hash before
 * dispatching the crawl for them). Passing a URL here whose hash we
 * haven't verified would be a correctness bug — we'd copy stale
 * evidence forward as if it were confirmed fresh.
 */
export async function carryEvidenceForward(
	prisma: PrismaClient,
	params: {
		previousCycleRef: string;
		newCycleRef: string;
		environmentRef: string;
		urls: string[];
	},
): Promise<CarryForwardResult> {
	const { previousCycleRef, newCycleRef, environmentRef, urls } = params;
	const result: CarryForwardResult = {
		carriedUrls: [],
		uncoveredUrls: [],
		rowsCarried: 0,
	};
	if (urls.length === 0) return result;

	const now = new Date();

	for (const url of urls) {
		try {
			const rows = await prisma.evidence.findMany({
				where: {
					cycleRef: previousCycleRef,
					environmentRef,
					subjectRef: url,
				},
			});
			if (rows.length === 0) {
				result.uncoveredUrls.push(url);
				continue;
			}
			// Use createMany for bulk insert. Skip rows that would
			// collide on (cycleRef, evidenceKey) — shouldn't happen
			// since the new cycle is fresh, but skipDuplicates keeps
			// this idempotent in case of a retry.
			await prisma.evidence.createMany({
				data: rows.map((r) => ({
					evidenceKey: r.evidenceKey,
					evidenceType: r.evidenceType,
					subjectRef: r.subjectRef,
					workspaceRef: r.workspaceRef,
					environmentRef: r.environmentRef,
					pathScope: r.pathScope,
					cycleRef: newCycleRef,
					observedAt: now, // refresh so freshness-based checks see the reuse
					freshUntil: r.freshUntil,
					freshnessState: r.freshnessState,
					stalenessReason: r.stalenessReason,
					sourceKind: r.sourceKind,
					collectionMethod: "reused", // marker for future debugging
					qualityScore: r.qualityScore,
					payload: r.payload,
					contentHash: r.contentHash,
				})),
				skipDuplicates: true,
			});
			result.carriedUrls.push(url);
			result.rowsCarried += rows.length;
		} catch (err) {
			console.warn(
				`[cycle-modes.carryForward] failed url=${url} cycle=${newCycleRef}:`,
				err,
			);
			result.uncoveredUrls.push(url);
		}
	}

	return result;
}

/**
 * Resolve the most recent successful AuditCycle for an environment.
 * Returns null if there's no prior cycle to compare against (the
 * runner treats this as "must run as cold").
 */
export async function getPreviousCompletedCycle(
	prisma: PrismaClient,
	environmentId: string,
	excludeCycleId: string,
): Promise<{ id: string; cycleRef: string; cycleType: string } | null> {
	const row = await prisma.auditCycle.findFirst({
		where: {
			environmentId,
			status: "complete",
			id: { not: excludeCycleId },
		},
		orderBy: { completedAt: "desc" },
		select: { id: true, cycleType: true },
	});
	if (!row) return null;
	return {
		id: row.id,
		cycleRef: `audit_cycle:${row.id}`,
		cycleType: row.cycleType,
	};
}

/**
 * Look up the previous cycle's contentHash for a URL (HttpResponse
 * evidence). Returns null if the URL wasn't in that cycle or the hash
 * wasn't recorded (e.g. pre-Fase-3 evidence).
 */
export async function getPreviousContentHash(
	prisma: PrismaClient,
	params: {
		previousCycleRef: string;
		environmentRef: string;
		url: string;
	},
): Promise<string | null> {
	try {
		const row = await prisma.evidence.findFirst({
			where: {
				cycleRef: params.previousCycleRef,
				environmentRef: params.environmentRef,
				subjectRef: params.url,
				evidenceType: "http_response",
			},
			select: { contentHash: true },
		});
		return row?.contentHash ?? null;
	} catch {
		return null;
	}
}
