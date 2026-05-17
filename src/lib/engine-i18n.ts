// ──────────────────────────────────────────────
// Engine string translation
//
// The audit engine emits cause/effect strings and decision-conflict notes
// in English (baked into baselines / conflict-resolver). Those strings end
// up serialised inside the FindingProjection / WorkspaceCoherence rows so
// they're frozen at cycle time, not at render time.
//
// Until the engine emits structured i18n keys, this module bridges the
// gap by attempting a render-time lookup in the dictionary, with safe
// fallback to the original English text. The mapping is intentionally
// best-effort — if a key is missing the user still sees the engine output.
// ──────────────────────────────────────────────

import type { useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations>;

/**
 * Translate an engine-generated cause/effect string using the inference key
 * as the lookup target. Falls back to the raw English string when no
 * translation is available so we never render an empty paragraph.
 */
export function translateEngineCopy(
	inferenceKey: string | null | undefined,
	fallback: string | null | undefined,
	tEngine: Translator,
): string {
	if (inferenceKey && tEngine.has(`inference_titles.${inferenceKey}`)) {
		return tEngine(`inference_titles.${inferenceKey}`);
	}
	return fallback ?? "";
}

// ──────────────────────────────────────────────
// Conflict annotation translation
//
// The decision conflict resolver emits a handful of templated English
// sentences (Note: while X suggests Y, A requires B action first., etc.).
// Until the engine carries the template key + payload through to the
// projection, regex-match the known patterns and translate at render time.
// ──────────────────────────────────────────────

interface ConflictTemplateMatch {
	key: string;
	payload: Record<string, string>;
}

const PATTERNS: Array<{
	regex: RegExp;
	build: (m: RegExpMatchArray) => ConflictTemplateMatch;
}> = [
	{
		// Severity gap >= 3 — note from conflict-resolver:143-144
		regex: /^Note: while (.+?) suggests (.+?), (.+?) requires (.+?) action first\.$/,
		build: (m) => ({
			key: "note_severity_gap_high",
			payload: {
				lower_key: m[1],
				lower_impact: m[2],
				higher_key: m[3],
				higher_impact: m[4],
			},
		}),
	},
	{
		// Severity gap == 2 — note from conflict-resolver:163
		regex: /^(.+?) assessment is conditional on addressing (.+?) first\.$/,
		build: (m) => ({
			key: "note_severity_gap_medium",
			payload: { lower_key: m[1], higher_key: m[2] },
		}),
	},
	{
		// Severity divergence — description from conflict-resolver:179
		regex: /^Same evidence evaluated as (\w+) by "(.+?)" but (\w+) by "(.+?)"$/,
		build: (m) => ({
			key: "desc_severity_divergence",
			payload: {
				severity_a: m[1],
				key_a: m[2],
				severity_b: m[3],
				key_b: m[4],
			},
		}),
	},
	{
		// Impact contradiction — description from conflict-resolver:137
		regex: /^"(.+?)" says (.+?) but "(.+?)" says (.+?)$/,
		build: (m) => ({
			key: "desc_impact_contradiction",
			payload: {
				key_a: m[1],
				impact_a: m[2],
				key_b: m[3],
				impact_b: m[4],
			},
		}),
	},
	{
		// Confidence asymmetry — note from conflict-resolver:206-207
		regex: /^Confidence in (.+?) is low \((\d+)%\)\.\s+Consider verification before acting on it\.$/,
		build: (m) => ({
			key: "note_confidence_low",
			payload: { key: m[1], score: m[2] },
		}),
	},
];

function humanizeKey(snake: string): string {
	return snake.replace(/_/g, " ");
}

/**
 * Render-time translation for decision conflict annotations stored in
 * WorkspaceCoherence.conflict_annotations.
 *
 * Tries to identify a known engine template via regex; if matched, looks
 * up the translation under `console.workspaces.detail.coherence_notes.<key>`
 * with the captured payload + locale-aware labels for decision impact
 * and severity values. Otherwise returns the original note unchanged.
 */
export function translateConflictNote(
	note: string,
	tNotes: Translator,
	tImpact: Translator,
	tSeverity: Translator,
): string {
	for (const p of PATTERNS) {
		const m = note.match(p.regex);
		if (!m) continue;
		const { key, payload } = p.build(m);
		const dictKey = key;
		if (!tNotes.has(dictKey)) return note;

		// Localise the decision_impact + severity values when present so
		// the rendered note reads natively (e.g. "Observar" instead of
		// "observe", "Crítico" instead of "critical").
		const localized: Record<string, string> = {};
		for (const [k, v] of Object.entries(payload)) {
			if (k === "lower_impact" || k === "higher_impact" || k === "impact_a" || k === "impact_b") {
				localized[k] = tImpact.has(v) ? tImpact(v) : v;
			} else if (k === "severity_a" || k === "severity_b") {
				localized[k] = tSeverity.has(v) ? tSeverity(v) : v;
			} else if (k.endsWith("_key") || k === "key") {
				localized[k] = humanizeKey(v);
			} else {
				localized[k] = v;
			}
		}
		return tNotes(dictKey, localized);
	}
	return note;
}
