import React from "react";

// ──────────────────────────────────────────────
// rich-text — client-side emphasis for LLM-generated paragraphs.
//
// LLM endpoints (Pulse, briefings, framework-lens quotes) emit
// plain prose with no markdown. This util walks the string and
// bolds high-signal tokens so the user's eye lands on the numbers
// instead of bouncing across a wall of text:
//
//   - Currency amounts: R$1.234, $1.2k, €450
//   - Percentages: 12%, 3.5%
//   - Bare counts followed by a noun in any of our 4 locales
//     (findings, achados, hallazgos, Befunde / issues, problemas)
//
// Returns a Fragment with <strong> spans so the caller can wrap
// in any text element (<p>, <span>, etc.) without nesting issues.
// ──────────────────────────────────────────────

// Order matters — currency must match before bare numbers, otherwise
// the leading "1.234" eats the "R$" prefix.
const PATTERNS: RegExp[] = [
	// Currency: R$, $, €, US$, with optional space then digits/dots/commas, optional k/M suffix
	/(?:R\$|US\$|\$|€)\s?[\d.,]+\s?[kKmM]?\b/g,
	// Percentages
	/\b\d+(?:[.,]\d+)?\s?%/g,
	// Counts of findings/issues across our 4 supported locales
	/\b\d+\s+(?:findings?|achados?|problemas?|issues?|hallazgos?|Befunde|ciclos?|cycles?|dias?|days?)\b/gi,
];

function findAllMatches(text: string): Array<{ start: number; end: number }> {
	const matches: Array<{ start: number; end: number }> = [];
	for (const pattern of PATTERNS) {
		for (const m of text.matchAll(pattern)) {
			if (m.index == null) continue;
			matches.push({ start: m.index, end: m.index + m[0].length });
		}
	}
	matches.sort((a, b) => a.start - b.start || b.end - a.end);
	const merged: Array<{ start: number; end: number }> = [];
	for (const m of matches) {
		const last = merged[merged.length - 1];
		if (!last || m.start >= last.end) merged.push(m);
	}
	return merged;
}

/**
 * Render a plain string with key numeric tokens bolded.
 * Pure text in → ReactNode array out. No markdown parsing.
 */
export function renderRichText(text: string): React.ReactNode {
	if (!text) return null;
	const matches = findAllMatches(text);
	if (matches.length === 0) return text;

	const parts: React.ReactNode[] = [];
	let cursor = 0;
	matches.forEach((m, i) => {
		if (m.start > cursor) parts.push(text.slice(cursor, m.start));
		parts.push(
			<strong key={i} className="font-semibold text-content">
				{text.slice(m.start, m.end)}
			</strong>,
		);
		cursor = m.end;
	});
	if (cursor < text.length) parts.push(text.slice(cursor));
	return <>{parts}</>;
}
