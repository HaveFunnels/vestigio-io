// ──────────────────────────────────────────────
// BusinessContext accessor (PV.2.1)
//
// Single source of truth for the perception layer, read by every PV.3
// consumer (findings/detection, plan precision, MCP chat) and the
// "O que analisamos" surface list. Returns the RECONCILED vertical
// (resolveEffectiveVertical from PV.0): perception only overrides the
// onboarding prior above its confidence threshold — so a low-confidence
// misperception can't poison the plan thesis or the copilot.
//
// DB-coupled (imports prisma), so it is intentionally NOT re-exported from
// the package barrel (index.ts stays pure). Consumers import it directly.
// ──────────────────────────────────────────────

import {
  resolveEffectiveVertical,
  isSurfacePurpose,
  isContentFlag,
  type SurfacePurpose,
  type ContentFlag,
} from '../domain';

export interface BusinessContextSurface {
  url: string;
  purpose: SurfacePurpose;
  confidence: number; // 0-1
}

/** Tri-state content flag (PV.8) — present:true confirmed, present:false confirmed
 *  absent, missing = unknown. Read by perceivedFlag() in the detectors. */
export interface BusinessContextContentFlag {
  flag: ContentFlag;
  present: boolean;
  confidence: number; // 0-1
}

export interface BusinessContext {
  /** Reconciled vertical (perceived if confident enough, else onboarding). */
  vertical: string | null;
  vertical_source: 'perceived' | 'onboarding' | 'none';
  /** Confidence of the perceived vertical when it won; null otherwise. */
  vertical_confidence: number | null;
  surfaces: BusinessContextSurface[];
  contentFlags: BusinessContextContentFlag[];
}

function clamp01(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

/** Validate + normalize the persisted surfaces JSON into typed surfaces. */
export function coerceSurfaces(raw: unknown): BusinessContextSurface[] {
  if (!Array.isArray(raw)) return [];
  const out: BusinessContextSurface[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const row = s as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url || seen.has(url)) continue;
    const purpose = String(row.purpose ?? '').trim();
    if (!isSurfacePurpose(purpose)) continue; // drop out-of-ontology purpose
    seen.add(url);
    out.push({ url, purpose, confidence: clamp01(row.confidence) });
  }
  return out;
}

/** Validate + normalize the persisted content-flags JSON into typed flags. */
export function coerceContentFlags(raw: unknown): BusinessContextContentFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: BusinessContextContentFlag[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const row = f as Record<string, unknown>;
    const flag = String(row.flag ?? '').trim();
    if (!isContentFlag(flag) || seen.has(flag)) continue; // drop out-of-ontology / dupe
    seen.add(flag);
    out.push({ flag, present: row.present === true, confidence: clamp01(row.confidence) });
  }
  return out;
}

/** Pure reconciliation — testable without the DB. */
export function buildBusinessContext(input: {
  onboardingModel: string | null;
  perceivedVertical: string | null;
  perceivedVerticalConfidence: number | null;
  perceivedSurfaces: unknown;
  perceivedContentFlags?: unknown;
}): BusinessContext {
  const eff = resolveEffectiveVertical({
    onboarding: input.onboardingModel,
    perceived: input.perceivedVertical,
    perceivedConfidence: input.perceivedVerticalConfidence,
  });
  return {
    vertical: eff.vertical,
    vertical_source: eff.source,
    vertical_confidence: eff.source === 'perceived' ? input.perceivedVerticalConfidence : null,
    surfaces: coerceSurfaces(input.perceivedSurfaces),
    contentFlags: coerceContentFlags(input.perceivedContentFlags),
  };
}

/**
 * Read the reconciled BusinessContext for an environment. Never throws — a
 * missing env or DB hiccup yields an empty/none context so callers degrade to
 * the pre-perception behaviour (onboarding prior).
 */
export async function getBusinessContext(envId: string): Promise<BusinessContext> {
  try {
    // Dynamic import keeps prisma out of the module graph so the pure helpers
    // above stay unit-testable without a DB (same pattern as content-cache).
    const { prisma } = await import('../../src/libs/prismaDb').catch(
      () => ({ prisma: null as unknown as typeof import('../../src/libs/prismaDb').prisma }),
    );
    if (!prisma) {
      return { vertical: null, vertical_source: 'none', vertical_confidence: null, surfaces: [], contentFlags: [] };
    }
    const env = await prisma.environment.findUnique({
      where: { id: envId },
      select: {
        organizationId: true,
        perceivedVertical: true,
        perceivedVerticalConfidence: true,
        perceivedSurfacesJson: true,
        perceivedContentFlagsJson: true,
      },
    });
    if (!env) {
      return { vertical: null, vertical_source: 'none', vertical_confidence: null, surfaces: [], contentFlags: [] };
    }
    const profile = await prisma.businessProfile.findUnique({
      where: { organizationId: env.organizationId },
      select: { businessModel: true },
    });
    return buildBusinessContext({
      onboardingModel: profile?.businessModel ?? null,
      perceivedVertical: env.perceivedVertical,
      perceivedVerticalConfidence: env.perceivedVerticalConfidence,
      perceivedSurfaces: env.perceivedSurfacesJson,
      perceivedContentFlags: env.perceivedContentFlagsJson,
    });
  } catch (err) {
    console.warn(
      `[business-context] read failed for env=${envId}:`,
      err instanceof Error ? err.message : err,
    );
    return { vertical: null, vertical_source: 'none', vertical_confidence: null, surfaces: [], contentFlags: [] };
  }
}
