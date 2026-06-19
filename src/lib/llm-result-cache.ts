// ──────────────────────────────────────────────
// LLM Result Cache — generic two-layer (memory + DB) cache for the
// on-demand workspace LLM endpoints that previously kept their own
// module-scoped Map.
//
// Why this exists: pulse-summary, copy-tone, persona-rewrite, and
// test-recommendations each rebuilt the same anti-pattern — an
// in-memory Map<cacheKey, payload> that evaporated on every Railway
// deploy. After Wave 19a we know the right shape: L1 hot in-process
// for the burst of repeated callers, L2 in Postgres for survival.
// This module centralizes that pattern so the four endpoints can
// migrate in a handful of lines each.
//
// Consumers pass an opaque `payload` (anything JSON-serializable),
// keyed by (env, cycle, purpose, keyHash, locale). The keyHash is the
// hashed per-call discriminator — typically a small string built
// from the caller's input parameters (e.g. workspace name + finding
// IDs, persona id, page URL).
// ──────────────────────────────────────────────

import { createHash } from "crypto";
import { prisma } from "@/libs/prismaDb";

interface CacheKey {
  environmentId: string;
  cycleId: string;
  purpose: string;
  keyHash?: string;
  locale?: string;
}

interface MemEntry<T> {
  payload: T;
  expiresAt: number;
}

const memoryCache = new Map<string, MemEntry<unknown>>();
const MEMORY_TTL_MS = 5 * 60_000; // 5 min — DB is the survival layer; memory is just dedup for burst requests
const MAX_MEMORY_ENTRIES = 1000;

function memKey(k: CacheKey): string {
  return `${k.environmentId}|${k.cycleId}|${k.purpose}|${k.keyHash ?? ""}|${k.locale ?? "en"}`;
}

/**
 * Compute a stable hash for the per-call discriminator. Same input
 * always produces the same key → idempotent cache lookups.
 */
export function hashCacheDiscriminator(parts: Array<string | number | undefined | null>): string {
  const joined = parts.map((p) => (p == null ? "" : String(p))).join("|");
  return createHash("sha256").update(joined).digest("hex").slice(0, 32);
}

export async function readLlmCache<T>(key: CacheKey): Promise<T | null> {
  const mk = memKey(key);
  const now = Date.now();
  const mem = memoryCache.get(mk);
  if (mem && mem.expiresAt > now) return mem.payload as T;

  try {
    const row = await prisma.llmResultCache.findUnique({
      where: {
        environmentId_cycleId_purpose_keyHash_locale: {
          environmentId: key.environmentId,
          cycleId: key.cycleId,
          purpose: key.purpose,
          keyHash: key.keyHash ?? "",
          locale: key.locale ?? "en",
        },
      },
      select: { payload: true },
    });
    if (!row) return null;
    const payload = row.payload as unknown as T;
    setMemoryCached(mk, payload);
    return payload;
  } catch (err) {
    // Defensive: a missing/migrating table must not break the
    // endpoint — fall through to the LLM call.
    return null;
  }
}

export async function writeLlmCache<T>(
  key: CacheKey,
  payload: T,
  meta?: { modelId?: string; costCents?: number },
): Promise<void> {
  setMemoryCached(memKey(key), payload);
  try {
    await prisma.llmResultCache.upsert({
      where: {
        environmentId_cycleId_purpose_keyHash_locale: {
          environmentId: key.environmentId,
          cycleId: key.cycleId,
          purpose: key.purpose,
          keyHash: key.keyHash ?? "",
          locale: key.locale ?? "en",
        },
      },
      create: {
        environmentId: key.environmentId,
        cycleId: key.cycleId,
        purpose: key.purpose,
        keyHash: key.keyHash ?? "",
        locale: key.locale ?? "en",
        payload: payload as unknown as object,
        modelId: meta?.modelId ?? null,
        costCents: meta?.costCents ?? 0,
      },
      update: {
        payload: payload as unknown as object,
        modelId: meta?.modelId ?? null,
        costCents: meta?.costCents ?? 0,
      },
    });
  } catch (err) {
    // Memory cache still serves this request; we just lose
    // cross-deploy persistence.
  }
}

function setMemoryCached<T>(mk: string, payload: T): void {
  memoryCache.set(mk, { payload, expiresAt: Date.now() + MEMORY_TTL_MS });
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
}
