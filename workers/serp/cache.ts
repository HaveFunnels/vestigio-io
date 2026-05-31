import { createHash } from "node:crypto";
import { prisma } from "../../src/libs/prismaDb";
import type { SerpQueryResult } from "./types";

// ──────────────────────────────────────────────
// SERP cache — Wave 25
//
// Reuses the existing ContentEnrichmentCache table (Json payload,
// per-env scope, contentHash dedupe) so we don't add a new migration
// just for SERP. The cache key combines provider + normalized query
// + locale so the same query on the same provider in the same
// locale shares results across cycles.
//
// TTL: 24h by default. SERP rankings shift but slowly at the
// week-over-week scale that matters for competitive intel — fresh
// enough to catch real changes, stale enough that we don't burn
// API quota on cosmetic re-checks. SERPs for branded queries
// (low volume) are even more stable; we'll tune later if needed.
// ──────────────────────────────────────────────

const CACHE_PURPOSE = "serp_query";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeQuery(query: string): string {
	return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hashSerpKey(provider: string, query: string, locale: string): string {
	const normalized = `${provider}|${normalizeQuery(query)}|${locale}`;
	return createHash("sha256").update(normalized).digest("hex");
}

export async function readSerpCache(
	envId: string,
	provider: string,
	query: string,
	locale: string,
	ttlMs: number = DEFAULT_TTL_MS,
): Promise<SerpQueryResult | null> {
	const contentHash = hashSerpKey(provider, query, locale);
	try {
		const row = await prisma.contentEnrichmentCache.findUnique({
			where: {
				environmentId_purpose_contentHash_locale: {
					environmentId: envId,
					purpose: CACHE_PURPOSE,
					contentHash,
					locale,
				},
			},
		});
		if (!row) return null;
		const age = Date.now() - new Date(row.createdAt).getTime();
		if (age > ttlMs) return null;
		// Bump hitCount + lastHitAt async (don't block the read).
		prisma.contentEnrichmentCache
			.update({
				where: { id: row.id },
				data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
			})
			.catch(() => {});
		return { ...(row.payload as unknown as SerpQueryResult), from_cache: true };
	} catch {
		// Cache miss + DB unavailable both look the same to the caller.
		return null;
	}
}

export async function writeSerpCache(
	envId: string,
	provider: string,
	query: string,
	locale: string,
	result: SerpQueryResult,
): Promise<void> {
	const contentHash = hashSerpKey(provider, query, locale);
	try {
		await prisma.contentEnrichmentCache.upsert({
			where: {
				environmentId_purpose_contentHash_locale: {
					environmentId: envId,
					purpose: CACHE_PURPOSE,
					contentHash,
					locale,
				},
			},
			create: {
				environmentId: envId,
				purpose: CACHE_PURPOSE,
				contentHash,
				locale,
				pageUrl: null,
				payload: result as unknown as object,
				modelId: provider,
				costCents: 0,
			},
			update: {
				payload: result as unknown as object,
				modelId: provider,
				lastHitAt: new Date(),
			},
		});
	} catch (err) {
		console.warn(
			"[serp-cache] failed to write cache:",
			err instanceof Error ? err.message : err,
		);
	}
}
