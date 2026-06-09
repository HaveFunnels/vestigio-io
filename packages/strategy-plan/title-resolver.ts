// ──────────────────────────────────────────────
// Unified title resolver for inference keys
//
// Consolidates the 3 sources the engine uses to translate an
// inferenceKey into a human-facing title:
//   1. inference_titles[key] — static per-key strings (most common path).
//   2. dynamic_titles[key]   — parameterised funnel/structural titles
//      including `funnel_dead_end_page` (parameterless) and
//      `funnel_broken_path_<from>_to_<to>` / `funnel_missing_stage_<stage>`
//      (template + slot extraction from the key suffix).
//   3. root_cause_titles[key] — back-up for keys that disagree on which
//      bucket they belong to across dict versions.
//
// The plan generator previously only consulted inference_titles +
// root_cause_titles, so any inferenceKey routed through dynamic_titles
// (notably `funnel_dead_end_page`) leaked as raw "Funnel Dead End Page".
// This module is the single source of truth — call it from every
// plan sub-section that needs to translate an inferenceKey.
// ──────────────────────────────────────────────

import type { EngineTranslations } from "../projections/types";

const FUNNEL_STAGE_FALLBACK: Record<string, string> = {
	awareness: "awareness",
	consideration: "consideration",
	decision: "decision",
	post_purchase: "post-purchase",
};

function friendlyStage(token: string, translations?: EngineTranslations): string {
	const stageNames = translations?.funnel_stage_names;
	return stageNames?.[token] ?? FUNNEL_STAGE_FALLBACK[token] ?? token.replace(/_/g, " ");
}

/**
 * Resolve an inferenceKey to its human-readable title in the owner's
 * locale. Returns `null` when the key isn't found in any of the title
 * maps so callers can apply their own fallback (typically humanizing
 * the snake_case identifier).
 */
export function resolveInferenceTitle(
	key: string,
	translations?: EngineTranslations,
): string | null {
	if (!key) return null;

	// 1. inference_titles — direct lookup, no transformation.
	const direct = translations?.inference_titles?.[key];
	if (direct) return direct;

	// 2. dynamic_titles — parameter-less keys. EngineTranslations types
	// dynamic_titles with named-key shape; cast through unknown to
	// support arbitrary keys without losing strict typing elsewhere.
	const dynamicMap = translations?.dynamic_titles as
		| Record<string, string>
		| undefined;
	const dynamicDirect = dynamicMap?.[key];
	if (dynamicDirect && !dynamicDirect.includes("{")) {
		return dynamicDirect;
	}

	// 2b. dynamic_titles — parameterised keys (slot extraction).
	if (key.startsWith("funnel_missing_stage_")) {
		const stage = friendlyStage(key.replace("funnel_missing_stage_", ""), translations);
		const tpl =
			translations?.dynamic_titles?.funnel_missing_stage
			?? "Missing funnel stage: {stage}";
		return tpl.replace("{stage}", stage);
	}
	if (key.startsWith("funnel_broken_path_")) {
		const parts = key.replace("funnel_broken_path_", "").split("_to_");
		const from = friendlyStage(parts[0] ?? "", translations);
		const to = friendlyStage(parts[1] ?? "", translations);
		const tpl =
			translations?.dynamic_titles?.funnel_broken_path
			?? "No CTA path: {from} → {to}";
		return tpl.replace("{from}", from).replace("{to}", to);
	}
	if (key.startsWith("funnel_weak_connection_")) {
		const parts = key.replace("funnel_weak_connection_", "").split("_to_");
		const from = friendlyStage(parts[0] ?? "", translations);
		const to = friendlyStage(parts[1] ?? "", translations);
		const tpl =
			translations?.dynamic_titles?.funnel_weak_connection
			?? "Weak connection: {from} → {to}";
		return tpl.replace("{from}", from).replace("{to}", to);
	}
	if (key === "funnel_dead_end_page") {
		return (
			translations?.dynamic_titles?.funnel_dead_end_page
			?? "Dead-end commercial page (no CTA to next stage)"
		);
	}

	// 3. root_cause_titles — last-ditch fallback for inconsistent dicts.
	const rc = translations?.root_cause_titles?.[key];
	if (rc) return rc;

	return null;
}
