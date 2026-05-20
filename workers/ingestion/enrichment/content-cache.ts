// ──────────────────────────────────────────────
// Content-Hash Cache for Page Enrichments (Wave 19c)
//
// Cross-cycle cache for LLM-derived analyses of page copy. Each
// enricher (copy-micro-copy, copy-seo-tension, pricing-psychology,
// etc.) normalizes its prompt input into a stable string, hashes it,
// and asks this module to "give me last week's assessment if the
// hash matches, otherwise call the LLM and remember the answer."
//
// When copy hasn't changed between cycles — the common case for an
// SMB e-commerce site that updates the homepage a few times a year —
// this turns a $0.0001 Haiku call into a ~50ms Postgres lookup.
//
// ── How to wire an enricher ──────────────────
//
//   const cached = await readContentEnrichmentCache(envId, purpose,
//     contentHash, locale);
//   if (cached) {
//     // re-use cached.payload, write Evidence with current cycleRef
//     return cached.payload;
//   }
//   const result = await callModel(...);
//   const parsed = parseAssessment(result);
//   await writeContentEnrichmentCache(envId, purpose, contentHash,
//     locale, parsed, { modelId, costCents, pageUrl });
//   return parsed;
//
// ── Safety ───────────────────────────────────
//
// - Defensive: a missing table or DB hiccup falls back to a cache miss
//   (the enricher just re-pays for the LLM call). No throw should
//   ever leak out of this module.
// - No in-process layer here. The existing per-cycle dedupe inside
//   each enricher's loop is sufficient — the cross-cycle case is
//   what we're solving.
// - The hash is whatever the caller computes. Centralizing the
//   normalization recipe would couple this module to every enricher;
//   instead each enricher owns its own normalize() and we just
//   provide hashContentInput() as a convenience.
// ──────────────────────────────────────────────

import { createHash } from "node:crypto";

export interface ContentEnrichmentCacheEntry<T = unknown> {
  payload: T;
  modelId: string | null;
  costCents: number;
  createdAt: Date;
  hitCount: number;
}

export interface WriteCacheOptions {
  modelId?: string | null;
  costCents?: number;
  pageUrl?: string | null;
}

/**
 * Stable hash for an enrichment's prompt input. Whitespace is
 * collapsed and the string is lowercased before hashing so cosmetic
 * edits (an extra space, a casing change) don't bust the cache.
 *
 * The caller is responsible for picking the right input: include
 * every prompt-input field that would meaningfully change the
 * assessment, exclude anything cosmetic or per-cycle.
 */
export function hashContentInput(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 48);
}

/**
 * Read a cached enrichment. Returns null on miss, on DB unavailable,
 * or on any other failure — the caller must treat null as "go ahead
 * and call the LLM."
 */
export async function readContentEnrichmentCache<T = unknown>(
  environmentId: string,
  purpose: string,
  contentHash: string,
  locale: string,
): Promise<ContentEnrichmentCacheEntry<T> | null> {
  try {
    const { prisma } = await import("../../../src/libs/prismaDb").catch(
      () => ({ prisma: null as any }),
    );
    if (!prisma) return null;

    const row = await prisma.contentEnrichmentCache.findUnique({
      where: {
        environmentId_purpose_contentHash_locale: {
          environmentId,
          purpose,
          contentHash,
          locale,
        },
      },
    });
    if (!row) return null;

    // Fire-and-forget hit accounting. We bump hitCount + lastHitAt so
    // an eventual eviction pass can keep the hot rows.
    prisma.contentEnrichmentCache
      .update({
        where: { id: row.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch(() => {});

    return {
      payload: row.payload as T,
      modelId: row.modelId,
      costCents: row.costCents,
      createdAt: row.createdAt,
      hitCount: row.hitCount,
    };
  } catch (err) {
    console.warn(
      `[content-cache] read failed for env=${environmentId} purpose=${purpose}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Persist a freshly-computed enrichment. Idempotent on the unique key
 * (env, purpose, contentHash, locale): if a row already exists, we
 * leave its payload untouched and just bump the bookkeeping. The
 * usual reason for a collision is a concurrent enrichment in another
 * cycle picking the same content at the same time — both copies of
 * the result are functionally identical.
 */
export async function writeContentEnrichmentCache(
  environmentId: string,
  purpose: string,
  contentHash: string,
  locale: string,
  payload: unknown,
  options: WriteCacheOptions = {},
): Promise<void> {
  try {
    const { prisma } = await import("../../../src/libs/prismaDb").catch(
      () => ({ prisma: null as any }),
    );
    if (!prisma) return;

    await prisma.contentEnrichmentCache.upsert({
      where: {
        environmentId_purpose_contentHash_locale: {
          environmentId,
          purpose,
          contentHash,
          locale,
        },
      },
      create: {
        environmentId,
        purpose,
        contentHash,
        locale,
        pageUrl: options.pageUrl ?? null,
        payload: payload as any,
        modelId: options.modelId ?? null,
        costCents: options.costCents ?? 0,
      },
      update: {
        // Don't overwrite payload on collision — concurrent writes
        // race-condition into the same assessment by design. Just
        // update lastHitAt so we know this row is still in use.
        lastHitAt: new Date(),
      },
    });
  } catch (err) {
    console.warn(
      `[content-cache] write failed for env=${environmentId} purpose=${purpose}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
