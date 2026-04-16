import type { VerificationStrategy } from '../domain/actions';

// ──────────────────────────────────────────────
// Remediation & Verification Catalog
//
// Single source of truth for the remediation_steps / verification_*
// fields populated on every FindingProjection + ActionProjection.
// Keyed by inference_key so it's trivial to look up when projecting
// findings (FindingProjection already carries inference_key).
//
// Format contract lives in docs/REMEDIATION_FORMAT.md. In short:
//   - remediation_steps: 2-7 verb-led sentences, ≤160 chars, no
//     sequencing words (array order IS the sequence).
//   - estimated_effort_hours: median dev-hours. Null when honestly
//     uncalibrated.
//   - verification_strategy: one of 7 values matching the taxonomy
//     in packages/domain/actions.ts.
//   - verification_notes: human-readable copy the MCP / UI shows
//     when user asks "how does verify work for this finding?" For
//     pixel_accumulation entries include "current/required sessions"
//     placeholder — Phase 3.2 resolves at render time.
//   - verification_eta_seconds: approx wall-clock of the verify
//     dispatch. Null for pixel_accumulation (there's no dispatch).
//
// Entries with remediation_steps=null leave the projection fields
// null (same as pre-Phase-2). Entries present here light up the
// finding card and the MCP verification surface.
//
// Populated incrementally by category (scale_readiness, revenue_
// integrity, chargeback, saas, channel_integrity, deep_discovery,
// performance, discoverability, brand_integrity, shopify_commerce,
// behavioral). Every inference_key emitted by the engine has a
// catalog entry — the Phase 2 coverage goal is 100%.
// ──────────────────────────────────────────────

export interface CatalogEntry {
	/** Ordered remediation steps — see docs/REMEDIATION_FORMAT.md. */
	remediation_steps: string[];
	/** Median dev-hours for the fix. Null when uncalibrated. */
	estimated_effort_hours: number | null;
	/** How this finding is re-verified. */
	verification_strategy: VerificationStrategy;
	/** User-facing copy describing the verify dispatch. */
	verification_notes: string;
	/** Wall-clock ETA for the verify in seconds. Null for pixel_accumulation. */
	verification_eta_seconds: number | null;
}

/**
 * Language hint so Phase 3.2 localization can pick the right
 * dictionary. Every entry in this file is pt-BR; if we ever ship
 * en variants the catalog becomes `Record<locale, Record<key, Entry>>`.
 */
export const CATALOG_LOCALE = 'pt-BR';

export const REMEDIATION_CATALOG: Record<string, CatalogEntry> = {
	// Scaffolding only — Phase 2 commits populate content by
	// category. Every inference_key shipped by packages/impact/
	// baselines.ts will land here.
	//
	// Seed entries below are kept small so TSC + tests run clean
	// while content work is in flight. Real entries go into their
	// own per-category commits to keep diffs reviewable.
};

/**
 * Look up remediation + verification metadata for a finding.
 * Returns null when the inference_key hasn't been authored yet —
 * callers are expected to degrade gracefully (leave the projection
 * fields null and let the MCP fall back to its generic response).
 */
export function lookupRemediation(
	inferenceKey: string,
): CatalogEntry | null {
	return REMEDIATION_CATALOG[inferenceKey] ?? null;
}

/**
 * Resolve an action_key back to its canonical inference_key by
 * stripping the Action deriver's suffix pattern. deriver.ts creates
 * action_keys as `${decision_key}_primary`, `_secondary_N`, or
 * `_verify_N`. The base (before the suffix) is the decision_key,
 * which for most packs IS the inference_key it was built from.
 *
 * Returns null if the pattern doesn't match (e.g. hand-crafted
 * action keys that don't follow the deriver convention).
 */
export function actionKeyToInferenceKey(actionKey: string): string | null {
	const match = actionKey.match(/^(.+?)_(primary|secondary_\d+|verify_\d+)$/);
	return match ? match[1] : null;
}

/**
 * Look up remediation + verification metadata for a GlobalAction /
 * Action / ActionProjection by its action_key. Falls back to null
 * when the key can't be traced to an inference_key or the catalog
 * hasn't got that entry yet.
 */
export function lookupRemediationForAction(
	actionKey: string,
): CatalogEntry | null {
	const inferenceKey = actionKeyToInferenceKey(actionKey);
	if (!inferenceKey) return null;
	return lookupRemediation(inferenceKey);
}
