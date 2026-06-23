// ──────────────────────────────────────────────
// Perception parser (PV.2)
//
// Parses the perception LLM response into a BusinessPerception, validating
// every label against the CLOSED PV.0 taxonomies. Anti-slop by construction:
//   - vertical MUST be in PERCEIVED_VERTICALS, else the whole result is
//     rejected (fail-closed → pass emits nothing → reconciliation keeps
//     falling back to the onboarding prior).
//   - each surface purpose MUST be in SURFACE_PURPOSES, else that surface is
//     dropped.
//   - URLs not in the crawled set are dropped (no hallucinated surfaces).
//   - confidences are clamped to [0,1].
// The LLM only labels from closed sets; it never authors free-text findings.
// ──────────────────────────────────────────────

import {
  isPerceivedVertical,
  isSurfacePurpose,
  isContentFlag,
  type PerceivedVertical,
  type SurfacePurpose,
  type ContentFlag,
} from '../domain';

export interface PerceivedSurface {
  url: string;
  purpose: SurfacePurpose;
  confidence: number; // 0-1
}

/** Tri-state content flag (PV.8): present:true = confirmed present, present:false =
 *  confirmed absent, omitted entirely = unknown. */
export interface PerceivedContentFlag {
  flag: ContentFlag;
  present: boolean;
  confidence: number; // 0-1
}

export interface BusinessPerception {
  vertical: PerceivedVertical;
  vertical_confidence: number; // 0-1
  reasoning: string;
  surfaces: PerceivedSurface[];
  contentFlags: PerceivedContentFlag[];
}

/**
 * Minimum vertical_confidence for the pass to CACHE perceivedVertical on the
 * Environment. Below this we still emit the perception evidence (so it's
 * observable) but do NOT cache, so resolveEffectiveVertical keeps falling back
 * to onboarding. Distinct from PV.0's PERCEPTION_OVERRIDE_THRESHOLD (0.7),
 * which governs override at read time.
 */
export const PERCEPTION_CACHE_FLOOR = 0.6;

function clamp01(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Parse + validate the perception response. Returns null (fail-closed) on
 * malformed JSON or an out-of-ontology vertical. `validUrls`, when provided,
 * filters surfaces to URLs actually crawled this cycle.
 */
export function parsePerceptionResponse(
  raw: string,
  validUrls?: ReadonlySet<string>,
): BusinessPerception | null {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // Vertical MUST be in the closed taxonomy — fail closed otherwise. A
  // perception we can't place in the ontology is not trustworthy enough to act
  // on, so we discard the whole result rather than guess.
  const vertical = String(obj.vertical ?? '').trim();
  if (!isPerceivedVertical(vertical)) return null;

  const surfacesRaw = Array.isArray(obj.surfaces) ? obj.surfaces : [];
  const surfaces: PerceivedSurface[] = [];
  const seen = new Set<string>();
  for (const s of surfacesRaw) {
    if (!s || typeof s !== 'object') continue;
    const row = s as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url || seen.has(url)) continue;
    if (validUrls && !validUrls.has(url)) continue; // drop hallucinated URLs
    const purpose = String(row.purpose ?? '').trim();
    if (!isSurfacePurpose(purpose)) continue; // drop out-of-ontology purpose
    seen.add(url);
    surfaces.push({ url, purpose, confidence: clamp01(row.confidence) });
  }

  // Content flags (PV.8) — same closed-set / fail-closed discipline as surfaces:
  // drop out-of-ontology flag names, dedupe, clamp confidence. A flag the LLM
  // omits stays unknown (absent from the list), which the detector reads as "fall
  // back to corpus regex" — never as a confirmed absence.
  const flagsRaw = Array.isArray(obj.content_flags) ? obj.content_flags : [];
  const contentFlags: PerceivedContentFlag[] = [];
  const seenFlags = new Set<string>();
  for (const f of flagsRaw) {
    if (!f || typeof f !== 'object') continue;
    const row = f as Record<string, unknown>;
    const flag = String(row.flag ?? '').trim();
    if (!isContentFlag(flag) || seenFlags.has(flag)) continue; // drop out-of-ontology / dupe
    seenFlags.add(flag);
    contentFlags.push({ flag, present: row.present === true, confidence: clamp01(row.confidence) });
  }

  return {
    vertical,
    vertical_confidence: clamp01(obj.vertical_confidence),
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 500) : '',
    surfaces,
    contentFlags,
  };
}
