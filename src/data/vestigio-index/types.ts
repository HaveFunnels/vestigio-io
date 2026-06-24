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

export type VerticalSlug = "ecommerce" | "saas-b2b" | "infoprodutos" | "cursos" | "agencias";

/** Block types the essay renderer understands. Keep additions to
 *  this union conservative — every new type needs a render path in
 *  the [vertical]/[period]/[slug]/page.tsx component.
 *
 *  Visual-rhythm blocks (stat_callout, numbered_tiles, divider)
 *  added 2026-06-24 to break up the wall-of-prose pattern the
 *  first two editions fell into. Use them to keep the reader's
 *  scroll rhythm — long stretches of paragraphs alone drop off
 *  the audience even when the content is good. */
export type IndexEssayBlock =
	| { type: "lede"; text: string }
	| { type: "paragraph"; text: string }
	| { type: "heading"; level: 2 | 3; text: string }
	| { type: "pullquote"; text: string }
	| { type: "list"; items: string[] }
	| { type: "hook" /* inline CTA, single per essay, by convention */ }
	/** Hairline divider between major sections. No content; pure
	 *  visual rhythm break. */
	| { type: "divider" }
	/** Inline stat box. Big numeral (Fraunces serif) + small label
	 *  + optional 1-line context. Use to anchor a paragraph's
	 *  claim with a number the reader's eye lands on. */
	| { type: "stat_callout"; value: string; label: string; context?: string }
	/** Numbered list rendered as larger tiles (vs flat <li>). Each
	 *  tile has a serif numeral marker + title + optional body. */
	| {
			type: "numbered_tiles";
			items: Array<{ n: string; title: string; body?: string }>;
	  };

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
	/** Strip of 3-4 key data points shown immediately below the
	 *  title (above the body). Per editorial decision 2026-06-24:
	 *  we don't surface the sample size ("X sites analisados")
	 *  here — only the punch-line numbers. The cohort-anchor
	 *  remains in the footer; this strip is reader-eye anchoring. */
	stats?: Array<{ value: string; label: string }>;
}
