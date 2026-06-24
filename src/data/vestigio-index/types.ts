// ──────────────────────────────────────────────
// Vestigio Index — types
//
// Public editorial analysis published monthly per vertical at
// vestigio.io/vestigio-index/[vertical]/[YYYY-MM]/[slug].
//
// The essay shape is intentionally simple (typed array of section
// blocks, no MDX, no CMS) for two reasons:
//
//   1. Each edition is a curated piece, not user-generated. A
//      developer (or the founder) authors one per month. The
//      structured-array format keeps content review in PR diffs
//      where it belongs, and stays SSR-friendly for SEO.
//
//   2. The same essay shape will eventually be persisted to an
//      IndexEssay table once the cohort-scan pipeline ships and
//      generates drafts the editor approves. Keeping the shape in
//      types lets the future DB-backed and file-backed loaders
//      share the same renderer.
//
// Vertical slugs are lowercase kebab — they appear in the URL
// (vestigio.io/vestigio-index/ecommerce/2026-06/...).
// ──────────────────────────────────────────────

export type VerticalSlug = "ecommerce" | "saas-b2b" | "cursos" | "agencias";

/** Block types the essay renderer understands. Keep additions to
 *  this union conservative — every new type needs a render path in
 *  the [vertical]/[period]/[slug]/page.tsx component. */
export type IndexEssayBlock =
	| { type: "lede"; text: string }
	| { type: "paragraph"; text: string }
	| { type: "heading"; level: 2 | 3; text: string }
	| { type: "pullquote"; text: string }
	| { type: "list"; items: string[] }
	| { type: "hook" /* inline CTA, single per essay, by convention */ };

export interface IndexEssay {
	/** URL slug (kebab-case, Portuguese, no diacritics in URLs). */
	slug: string;
	vertical: VerticalSlug;
	/** Human label for the vertical, PT-BR. Shown in dateline. */
	verticalLabel: string;
	/** YYYY-MM. Drives the URL segment + sort order. */
	period: string;
	/** Edition number, monotonic across all verticals. */
	editionNumber: number;
	/** ISO date string (YYYY-MM-DD). */
	publishedAt: string;
	title: string;
	/** Short subtitle / kicker shown under the title. */
	subtitle: string;
	/** Single-line italic tese — the essay's central observation in
	 *  one sentence. Set in Fraunces italic at the top of the body. */
	tese: string;
	body: IndexEssayBlock[];
	/** Number of sites the cohort scan covered for this analysis.
	 *  Surfaced as a small "N sites analisados" line in the footer
	 *  so the data anchor is visible without dumping the URL list. */
	sitesAnalyzed: number;
	/** ≤155-char meta description for Google SERPs. */
	metaDescription: string;
}
