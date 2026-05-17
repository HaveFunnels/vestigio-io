// ──────────────────────────────────────────────
// splitTitleIntoSteps
//
// Derived secondary actions arrive with a flat prose title that IS
// the prescription ("Install analytics on every commercial page
// (homepage, pricing, checkout, thank-you). Verify consent banner
// does not block primary measurement.") but no remediation_steps,
// leaving the drawer's "Como Corrigir" section hidden.
//
// This helper splits a prose title into 1–5 actionable steps so the
// drawer can render the prescription as a numbered list. The split
// preserves the original locale (the title is already resolved via
// the engine's tr() lookup at projection time) so no i18n work is
// required here — UTF-safe regex only.
//
// Splitting rules (in order):
//   1. Explicit numbered markers — "(1)", "(2)", "(a)", "(b)"
//   2. Semicolons (universal sentence-join in all 4 locales)
//   3. Sentence boundaries: period/?/! followed by a space and a
//      capital letter (catches en/pt-BR/es/de equally; skips URLs
//      and "e.g." style abbreviations because they're not followed
//      by a capital).
//
// Falls back to [title] when nothing splits cleanly.
// ──────────────────────────────────────────────

const MAX_STEPS = 5;
const MIN_STEP_CHARS = 18;
const MAX_TITLE_FOR_SPLITTING = 1200;

const NUMBERED_MARKER_RE = /\((\d|[a-z])\)\s*/g;
const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇÄÖÜ])/;

function cleanStep(raw: string): string {
	return raw
		.replace(/\s+/g, " ")
		.replace(/^[\s.,;:—\-]+/, "")
		.replace(/[\s,;:—]+$/, "")
		.trim();
}

function shouldKeep(step: string): boolean {
	return step.length >= MIN_STEP_CHARS;
}

function trySplitOnNumberedMarkers(title: string): string[] | null {
	const matches = Array.from(title.matchAll(NUMBERED_MARKER_RE));
	if (matches.length < 2) return null;
	const parts: string[] = [];
	let prevEnd = 0;
	// Anything before the first marker is the lead-in (e.g. "Order:")
	const lead = title.slice(0, matches[0].index).trim();
	if (lead && lead.length >= MIN_STEP_CHARS && !/[:.]\s*$/.test(lead) === false) {
		// Lead ends with punctuation — keep as intro only if it doesn't end
		// with a colon (which would just be a label like "Order:").
		const leadStripped = lead.replace(/[:.]\s*$/, "").trim();
		if (leadStripped.length >= MIN_STEP_CHARS) parts.push(leadStripped);
	}
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		const start = (m.index ?? 0) + m[0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index ?? title.length : title.length;
		parts.push(cleanStep(title.slice(start, end)));
		prevEnd = end;
	}
	const kept = parts.filter(shouldKeep);
	return kept.length >= 2 ? kept.slice(0, MAX_STEPS) : null;
}

function trySplitOnSemicolons(title: string): string[] | null {
	if (!title.includes(";")) return null;
	const parts = title.split(";").map(cleanStep).filter(shouldKeep);
	return parts.length >= 2 ? parts.slice(0, MAX_STEPS) : null;
}

function trySplitOnSentences(title: string): string[] | null {
	const parts = title.split(SENTENCE_BOUNDARY_RE).map(cleanStep).filter(shouldKeep);
	return parts.length >= 2 ? parts.slice(0, MAX_STEPS) : null;
}

/**
 * Returns 1–5 cleaned steps from a prose title. Always returns at
 * least one item ([title]) — call sites can compare result.length
 * against 1 to detect "no split happened, the title is atomic."
 */
export function splitTitleIntoSteps(title: string | null | undefined): string[] {
	if (!title) return [];
	const trimmed = title.trim();
	if (!trimmed) return [];
	if (trimmed.length > MAX_TITLE_FOR_SPLITTING) {
		// Very long LLM blob — refuse rather than emit garbage steps.
		return [trimmed];
	}

	return (
		trySplitOnNumberedMarkers(trimmed) ??
		trySplitOnSemicolons(trimmed) ??
		trySplitOnSentences(trimmed) ??
		[trimmed]
	);
}
