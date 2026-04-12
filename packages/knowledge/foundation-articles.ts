/**
 * Foundation Knowledge Base Articles
 * ─────────────────────────────────────────────────────────────────
 *
 * Every finding (inference_key) and every root_cause_key in the engine
 * is guaranteed to have at least a *foundation* article available in
 * the knowledge base. Foundation articles are NOT authored by hand —
 * they are derived programmatically from the engine's existing
 * structured metadata (INFERENCE_TITLES, ROOT_CAUSE_TITLES,
 * ROOT_CAUSE_DESCRIPTIONS, INFERENCE_TO_PACK, INFERENCE_TO_ROOT_CAUSE).
 *
 * The Sanity CMS still acts as the override layer: any article
 * authored in Sanity with a matching `finding_key` / `root_cause_key`
 * / slug takes precedence over the foundation article. This means
 * documentation can be enriched over time without ever leaving a
 * "Learn more" link dead.
 *
 * Slug convention:
 *   - Findings:    `finding-${inference_key}`        e.g. `finding-trust_boundary_crossed`
 *   - Root causes: `root-cause-${root_cause_key}`    e.g. `root-cause-trust_failure_at_checkout`
 *   - Positives:   `finding-${positive_check_key}`   e.g. `finding-strong_cta_clarity`
 *
 * Article shape mirrors `KnowledgeArticle` from sanity-utils so
 * consumers don't need to know an article is locally generated.
 */

import {
  INFERENCE_TITLES,
  INFERENCE_TO_PACK,
  POSITIVE_CHECKS,
} from '../projections/engine';
import {
  INFERENCE_TO_ROOT_CAUSE,
  ROOT_CAUSE_TITLES,
  ROOT_CAUSE_DESCRIPTIONS,
} from '../intelligence/root-causes';
import { shopifyIntegrationSetup } from './guides/shopify-integration-setup';
import {
  getTranslatedInferenceTitle,
  getTranslatedRootCauseTitle,
  getTranslatedRootCauseDescription,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './article-translations';

// ── Types (mirror Sanity's KnowledgeArticle) ────────────────────

export interface FoundationArticle {
  _id: string;
  title: string;
  slug: { current: string };
  category: 'finding' | 'concept';
  locale: string;
  finding_key?: string;
  root_cause_key?: string;
  excerpt: string;
  body: PortableTextBlock[];
  publishedAt: null;
  /** Marker so consumers can distinguish foundation from authored content */
  is_foundation: true;
}

/** Guide articles share the same shape but use the 'guide' category. */
export interface GuideArticle extends Omit<FoundationArticle, 'category' | 'finding_key' | 'root_cause_key'> {
  category: 'guide';
}

// ── All guide articles (add new guides to this array) ──────────

const GUIDE_ARTICLES: GuideArticle[] = [
  shopifyIntegrationSetup,
];

interface PortableTextBlock {
  _type: 'block';
  _key: string;
  style: 'h2' | 'h3' | 'normal' | 'blockquote';
  markDefs?: Array<{ _key: string; _type: 'link'; href: string }>;
  children: Array<{
    _type: 'span';
    _key: string;
    text: string;
    marks?: string[];
  }>;
}

// ── Pack metadata (used for "What pack this finding belongs to") ──

const PACK_LABELS: Record<string, { name: string; lens: string }> = {
  scale_readiness: {
    name: 'Scale Readiness',
    lens: 'whether the business can safely scale paid traffic without amplifying broken commerce paths',
  },
  revenue_integrity: {
    name: 'Revenue Integrity',
    lens: 'where revenue is actively leaking from the conversion path',
  },
  chargeback_resilience: {
    name: 'Chargeback Resilience',
    lens: 'whether the business is structurally exposed to disputes and post-purchase chargebacks',
  },
  saas_growth_readiness: {
    name: 'SaaS Growth Readiness',
    lens: 'whether the product experience supports trial-to-paid conversion and expansion revenue',
  },
  unknown: {
    name: 'Cross-pack',
    lens: 'general commerce health across multiple analysis lenses',
  },
};

// ── Block-content helpers ───────────────────────────────────────

let blockCounter = 0;
function nextKey(): string {
  return `f${(++blockCounter).toString(36)}`;
}

function h2(text: string): PortableTextBlock {
  return {
    _type: 'block',
    _key: nextKey(),
    style: 'h2',
    children: [{ _type: 'span', _key: nextKey(), text, marks: [] }],
  };
}

function h3(text: string): PortableTextBlock {
  return {
    _type: 'block',
    _key: nextKey(),
    style: 'h3',
    children: [{ _type: 'span', _key: nextKey(), text, marks: [] }],
  };
}

function p(text: string): PortableTextBlock {
  return {
    _type: 'block',
    _key: nextKey(),
    style: 'normal',
    children: [{ _type: 'span', _key: nextKey(), text, marks: [] }],
  };
}

function quote(text: string): PortableTextBlock {
  return {
    _type: 'block',
    _key: nextKey(),
    style: 'blockquote',
    children: [{ _type: 'span', _key: nextKey(), text, marks: [] }],
  };
}

// ── Foundation builders ─────────────────────────────────────────

/**
 * Build a foundation article for a single finding (inference_key or
 * positive_check key). The article is composed from the existing
 * engine metadata so it cannot drift from what the engine actually
 * produces.
 *
 * When `locale` is provided (and is not 'en'), translated titles and
 * descriptions are used where available — falling back to English
 * for any key that lacks a translation.
 */
function buildFoundationArticleForFinding(inferenceKey: string, locale: string = 'en'): FoundationArticle | null {
  const title = INFERENCE_TITLES[inferenceKey];
  const positive = POSITIVE_CHECKS.find((c) => c.key === inferenceKey);

  if (!title && !positive) return null;

  const isPositive = !!positive;
  // For non-English locales, try the translated title first
  const englishTitle = positive?.title ?? title;
  const finalTitle = (locale !== 'en'
    ? getTranslatedInferenceTitle(locale, inferenceKey) ?? englishTitle
    : englishTitle);
  const packKey = positive?.pack ?? INFERENCE_TO_PACK[inferenceKey] ?? 'unknown';
  const pack = PACK_LABELS[packKey] ?? PACK_LABELS.unknown;

  const rootCauseEntry = INFERENCE_TO_ROOT_CAUSE[inferenceKey];
  const rootCauseKey = rootCauseEntry?.root_cause_key ?? null;
  const rootCauseTitle = rootCauseKey
    ? (locale !== 'en'
      ? getTranslatedRootCauseTitle(locale, rootCauseKey) ?? ROOT_CAUSE_TITLES[rootCauseKey]
      : ROOT_CAUSE_TITLES[rootCauseKey])
    : null;
  const rootCauseDescription = rootCauseKey
    ? (locale !== 'en'
      ? getTranslatedRootCauseDescription(locale, rootCauseKey) ?? ROOT_CAUSE_DESCRIPTIONS[rootCauseKey]
      : ROOT_CAUSE_DESCRIPTIONS[rootCauseKey])
    : null;

  // ── Excerpt ──
  const excerpt = isPositive
    ? `${positive!.description} Part of the ${pack.name} pack.`
    : rootCauseDescription
      ? `${rootCauseDescription.split('.').slice(0, 1).join('.')}. Part of the ${pack.name} pack.`
      : `Detected in the ${pack.name} pack — ${pack.lens}.`;

  // ── Body ──
  const body: PortableTextBlock[] = [];

  // What this finding means
  body.push(h2(isPositive ? 'What this confirms' : 'What this finding means'));
  body.push(p(finalTitle));
  if (isPositive) {
    body.push(p(positive!.description));
  } else if (rootCauseDescription) {
    body.push(p(rootCauseDescription));
  } else {
    body.push(p(
      `This finding flags a structural condition that affects ${pack.lens}. The detector fired against your collected evidence; the impact range shown alongside the finding is computed from your specific data.`,
    ));
  }

  // Why it matters
  body.push(h2('Why it matters'));
  if (isPositive) {
    body.push(p(
      `Positive findings are not noise — they confirm that a critical structural assumption holds for your site. They reduce uncertainty in adjacent decisions and let you move fast in this area without second-guessing the basics.`,
    ));
  } else {
    body.push(p(
      `Issues in the ${pack.name} pack speak to ${pack.lens}. The dollar impact attached to this finding is not a hypothesis: it is computed from your business inputs (or, when those are absent, from a transparent heuristic anchored to your evidence quality).`,
    ));
  }

  // How we detect it — Wave 2.4: framed around severity + verification stage
  // (the two qualitative signals the user actually sees), not numeric confidence.
  body.push(h2('How we detect it'));
  body.push(p(
    `Vestigio combines static evidence (HTTP responses, page content, policy presence, third-party scripts), dynamic browser verification (when run), and — when the pixel is configured — behavioral session signals. This finding was produced by combining one or more of these sources with the inference rules of the ${pack.name} pack.`,
  ));
  body.push(p(
    `Two things shape how seriously to take this finding right now: severity and verification stage. Severity reflects how much damage the underlying problem can do at your scale. Verification stage tells you how the supporting evidence was collected — static evidence is real but not yet corroborated by a real browser run, while a confirmed finding has been re-checked end-to-end. High severity findings that are still at the static evidence stage are a good candidate for running a verification before you act.`,
  ));

  // Linked root cause
  if (rootCauseTitle && rootCauseKey) {
    body.push(h2('Underlying root cause'));
    body.push(p(rootCauseTitle));
    if (rootCauseDescription) {
      body.push(p(rootCauseDescription));
    }
    body.push(quote(
      `Multiple findings can share the same root cause. Vestigio collapses related issues so the action list reflects fixable problems, not symptoms.`,
    ));
  }

  // What to do about it
  body.push(h2('What to do about it'));
  body.push(p(
    isPositive
      ? `No remediation is required for a positive finding. Use it as a structural anchor when discussing related risks, and re-check it on the next audit cycle to make sure it stays healthy.`
      : `The Actions tab will surface a concrete remediation derived from the same evidence as this finding, ranked by priority across all packs. Open the action drawer to see the suggested resolution path (fix, verify, track, or dismiss). For finding-specific reasoning tied to your data, use the chat — it can interpret the detector against your actual evidence and walk through the trade-offs.`,
  ));

  // CTA
  body.push(h2('Discuss this finding'));
  body.push(p(
    `Open the chat and ask Vestigio to explain how this finding applies to your specific business — including impact estimation, related findings, and the lowest-effort fix path. This is the recommended next step when foundation documentation is not enough.`,
  ));

  return {
    _id: `foundation:finding:${inferenceKey}${locale !== 'en' ? `:${locale}` : ''}`,
    title: finalTitle,
    slug: { current: `finding-${inferenceKey}` },
    category: 'finding',
    locale,
    finding_key: inferenceKey,
    excerpt,
    body,
    publishedAt: null,
    is_foundation: true,
  };
}

/**
 * Build a foundation article for a root cause. The article aggregates
 * the description and lists every inference key that maps into it,
 * giving the reader a structural view of the problem family.
 *
 * When `locale` is provided (and is not 'en'), translated titles and
 * descriptions are used where available — falling back to English.
 */
function buildFoundationArticleForRootCause(rootCauseKey: string, locale: string = 'en'): FoundationArticle | null {
  const title = ROOT_CAUSE_TITLES[rootCauseKey];
  if (!title) return null;

  // Use translated title and description when available
  const localizedTitle = locale !== 'en'
    ? getTranslatedRootCauseTitle(locale, rootCauseKey) ?? title
    : title;
  const description = locale !== 'en'
    ? getTranslatedRootCauseDescription(locale, rootCauseKey) ?? (ROOT_CAUSE_DESCRIPTIONS[rootCauseKey] ?? null)
    : (ROOT_CAUSE_DESCRIPTIONS[rootCauseKey] ?? null);

  // Find all findings that roll up into this root cause
  const findingKeys = Object.entries(INFERENCE_TO_ROOT_CAUSE)
    .filter(([, entry]) => entry.root_cause_key === rootCauseKey)
    .map(([key]) => key)
    .filter((key) => INFERENCE_TITLES[key]);

  // ── Excerpt ──
  const excerpt = description
    ? description.split('.').slice(0, 1).join('.') + '.'
    : localizedTitle;

  // ── Body ──
  const body: PortableTextBlock[] = [];

  body.push(h2('What this root cause is'));
  body.push(p(localizedTitle));
  if (description) {
    body.push(p(description));
  }

  if (findingKeys.length > 0) {
    body.push(h2('Findings that roll up into this root cause'));
    body.push(p(
      `Vestigio collapses related findings into a single root cause so that fixes target structural problems rather than individual symptoms. The following findings can all be expressions of this root cause:`,
    ));
    for (const key of findingKeys) {
      const findingTitle = locale !== 'en'
        ? getTranslatedInferenceTitle(locale, key) ?? INFERENCE_TITLES[key]
        : INFERENCE_TITLES[key];
      body.push(p(`• ${findingTitle}`));
    }
  }

  body.push(h2('Why root causes matter'));
  body.push(p(
    `A root cause is a structural condition: it explains why a class of findings exists, not just what each one looks like. Acting at the root-cause level is almost always cheaper than fixing each finding in isolation, because one structural fix can resolve many findings at once.`,
  ));
  body.push(p(
    `The action list in your console is built around root causes for this reason: actions are deduplicated and prioritized by cumulative impact across all findings that share the same underlying structural problem.`,
  ));

  body.push(h2('How to address it'));
  body.push(p(
    `Open the Actions tab in your console — the actions associated with this root cause include the suggested resolution path (fix, verify, track, or dismiss), an effort hint, and the cumulative impact range. For business-specific reasoning, ask Vestigio in chat: it can walk through trade-offs, related findings, and verification steps tailored to your data.`,
  ));

  return {
    _id: `foundation:root_cause:${rootCauseKey}${locale !== 'en' ? `:${locale}` : ''}`,
    title: localizedTitle,
    slug: { current: `root-cause-${rootCauseKey}` },
    category: 'concept',
    locale,
    root_cause_key: rootCauseKey,
    excerpt,
    body,
    publishedAt: null,
    is_foundation: true,
  };
}

// ── Cached generation ───────────────────────────────────────────

/** Union of all article types managed by the foundation system. */
export type AnyFoundationArticle = FoundationArticle | GuideArticle;

interface LocaleCache {
  byFindingKey: Map<string, FoundationArticle>;
  byRootCauseKey: Map<string, FoundationArticle>;
  bySlug: Map<string, AnyFoundationArticle>;
  allArticles: AnyFoundationArticle[];
}

/** Per-locale caches. English is always built first; other locales on demand. */
const _localeCache = new Map<string, LocaleCache>();

function ensureBuiltForLocale(locale: string): LocaleCache {
  const existing = _localeCache.get(locale);
  if (existing) return existing;

  blockCounter = 0;
  const cache: LocaleCache = {
    byFindingKey: new Map(),
    byRootCauseKey: new Map(),
    bySlug: new Map(),
    allArticles: [],
  };

  // Findings
  for (const inferenceKey of Object.keys(INFERENCE_TITLES)) {
    const article = buildFoundationArticleForFinding(inferenceKey, locale);
    if (!article) continue;
    cache.byFindingKey.set(inferenceKey, article);
    cache.bySlug.set(article.slug.current, article);
    cache.allArticles.push(article);
  }

  // Positive findings
  for (const positive of POSITIVE_CHECKS) {
    if (cache.byFindingKey.has(positive.key)) continue;
    const article = buildFoundationArticleForFinding(positive.key, locale);
    if (!article) continue;
    cache.byFindingKey.set(positive.key, article);
    cache.bySlug.set(article.slug.current, article);
    cache.allArticles.push(article);
  }

  // Root causes
  for (const rootCauseKey of Object.keys(ROOT_CAUSE_TITLES)) {
    const article = buildFoundationArticleForRootCause(rootCauseKey, locale);
    if (!article) continue;
    cache.byRootCauseKey.set(rootCauseKey, article);
    cache.bySlug.set(article.slug.current, article);
    cache.allArticles.push(article);
  }

  // Guide articles (English-only for now — shared across locales)
  for (const guide of GUIDE_ARTICLES) {
    cache.bySlug.set(guide.slug.current, guide);
    cache.allArticles.push(guide);
  }

  _localeCache.set(locale, cache);
  return cache;
}

/** Backwards-compatible: build/return the English cache. */
function ensureBuilt(): LocaleCache {
  return ensureBuiltForLocale('en');
}

// ── Public lookup API ───────────────────────────────────────────

/** Look up a foundation article by inference_key (finding). */
export function getFoundationArticleByFindingKey(
  findingKey: string,
  locale: string = 'en',
): FoundationArticle | null {
  const cache = ensureBuiltForLocale(locale);
  return cache.byFindingKey.get(findingKey) ?? null;
}

/** Look up a foundation article by root_cause_key. */
export function getFoundationArticleByRootCauseKey(
  rootCauseKey: string,
  locale: string = 'en',
): FoundationArticle | null {
  const cache = ensureBuiltForLocale(locale);
  return cache.byRootCauseKey.get(rootCauseKey) ?? null;
}

/** Look up a foundation article by slug (matches `finding-<key>`, `root-cause-<key>`, or guide slugs). */
export function getFoundationArticleBySlug(slug: string, locale: string = 'en'): AnyFoundationArticle | null {
  const cache = ensureBuiltForLocale(locale);
  return cache.bySlug.get(slug) ?? null;
}

/** Return every foundation article including guides (used by the catalog listing). */
export function listFoundationArticles(locale: string = 'en'): AnyFoundationArticle[] {
  const cache = ensureBuiltForLocale(locale);
  return cache.allArticles.slice();
}

/** Return only guide articles. */
export function listGuideArticles(): GuideArticle[] {
  const cache = ensureBuilt();
  return cache.allArticles.filter((a): a is GuideArticle => a.category === 'guide');
}

/** Used by tests to assert coverage. */
export function getFoundationCoverage(): {
  total_findings: number;
  total_root_causes: number;
  total_articles: number;
} {
  const cache = ensureBuilt();
  return {
    total_findings: cache.byFindingKey.size,
    total_root_causes: cache.byRootCauseKey.size,
    total_articles: cache.allArticles.length,
  };
}
