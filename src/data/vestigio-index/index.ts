// ──────────────────────────────────────────────
// Vestigio Index — essay registry + lookup helpers.
//
// Today this is a flat in-code registry (one file per essay,
// re-exported here). When the cohort-scan pipeline ships and
// essays land in DB, the public-facing helpers below stay the
// same — they get re-implemented on top of an IndexEssay table
// read. Route components don't need to know which backend is
// answering.
// ──────────────────────────────────────────────

import type { IndexEssay, VerticalSlug } from "./types";
import { ESSAY_ECOMMERCE_2026_06_PILARES } from "./ecommerce-2026-06-dois-pilares";

const ALL_ESSAYS: IndexEssay[] = [
	ESSAY_ECOMMERCE_2026_06_PILARES,
];

/** Sorted newest-first (by publishedAt desc). The landing page
 *  shows latest editions first, and the per-vertical archive page
 *  reads the same order. */
const ESSAYS_NEWEST_FIRST = [...ALL_ESSAYS].sort(
	(a, b) => b.publishedAt.localeCompare(a.publishedAt),
);

export function listAllEssays(): IndexEssay[] {
	return ESSAYS_NEWEST_FIRST;
}

export function listEssaysByVertical(vertical: VerticalSlug): IndexEssay[] {
	return ESSAYS_NEWEST_FIRST.filter((e) => e.vertical === vertical);
}

/** Lookup an essay by its URL segments. Returns null when any
 *  segment doesn't match — route components feed the 404. */
export function findEssay(
	vertical: string,
	period: string,
	slug: string,
): IndexEssay | null {
	return (
		ESSAYS_NEWEST_FIRST.find(
			(e) =>
				e.vertical === vertical &&
				e.period === period &&
				e.slug === slug,
		) || null
	);
}

/** Verticals that have at least one published essay. Drives the
 *  landing-page vertical chip row + the sitemap. */
export function listActiveVerticals(): Array<{ slug: VerticalSlug; label: string }> {
	const seen = new Map<VerticalSlug, string>();
	for (const e of ESSAYS_NEWEST_FIRST) {
		if (!seen.has(e.vertical)) seen.set(e.vertical, e.verticalLabel);
	}
	return Array.from(seen.entries()).map(([slug, label]) => ({ slug, label }));
}

export type { IndexEssay, VerticalSlug, IndexEssayBlock } from "./types";
