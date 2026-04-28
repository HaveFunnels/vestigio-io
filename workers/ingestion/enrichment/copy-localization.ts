import { callModel, isLlmEnabled } from "../../../apps/mcp/llm/client";
import type {
  Evidence,
  ContentEnrichmentPayload,
  CopyElementsPayload,
  PageContentPayload,
} from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";
import { httpFetch } from "../http-client";
import { extractCopyElements } from "./copy-elements-extractor";
import type { EnrichmentContext } from "./types";

// ──────────────────────────────────────────────
// Wave 3.10 Fase 4 — Item M: Localization Quality
//
// For multi-locale sites (hreflang tags or /en/, /es/, /fr/ URL
// patterns), compares persuasive structure between the primary
// locale and translations. Detects when translation "flattens"
// urgency, social proof specificity, CTA power, or value prop
// framing into generic literal translations.
//
// Produces ContentEnrichmentPayload with enrichment_type: 'localization_quality'
// Feeds signal `localization_persuasion_lost` when quality_score < 60
// ──────────────────────────────────────────────

/** Regex to detect locale prefix in URL paths */
const LOCALE_PREFIX_PATTERN = /^https?:\/\/[^/]+\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i;

/** Known locale codes (subset for common languages) */
const KNOWN_LOCALES = new Set([
  'en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'ja', 'ko', 'zh',
  'ar', 'ru', 'sv', 'da', 'fi', 'no', 'pl', 'tr', 'cs', 'ro',
  'hu', 'el', 'he', 'th', 'vi', 'id', 'ms', 'uk', 'bg', 'hr',
  'sk', 'sl', 'lt', 'lv', 'et',
  'en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz',
  'es-mx', 'es-ar', 'es-co', 'es-cl',
  'pt-br', 'pt-pt',
  'fr-fr', 'fr-ca', 'fr-be',
  'de-de', 'de-at', 'de-ch',
  'zh-cn', 'zh-tw', 'zh-hk',
]);

// ── Types ──────────────────────────────────────

export interface LocalizationQualityAnalysis {
  quality_score: number; // 0-100
  primary_locale: string;
  compared_locale: string;
  preserved: string[];   // "urgency", "social_proof_specificity", etc.
  lost_in_translation: string[]; // what was weakened
  issues: Array<{
    element: string;
    primary: string;
    translated: string;
    problem: string;
  }>;
  confidence: number;
}

// ── Locale detection ───────────────────────────

/**
 * Detect locale from URL prefix pattern.
 * Returns null if no locale prefix found.
 */
function detectLocaleFromUrl(url: string): string | null {
  const match = url.match(LOCALE_PREFIX_PATTERN);
  if (!match) return null;
  const locale = match[1].toLowerCase();
  return KNOWN_LOCALES.has(locale) ? locale : null;
}

/**
 * Strip locale prefix from URL to get the normalized path.
 * e.g., https://example.com/es/pricing -> /pricing
 */
function normalizePathWithoutLocale(url: string): string {
  try {
    const parsed = new URL(url);
    const locale = detectLocaleFromUrl(url);
    if (locale) {
      const pattern = new RegExp(`^/${locale}(?=/|$)`, 'i');
      return parsed.pathname.replace(pattern, '') || '/';
    }
    return parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Detect hreflang tags in HTML.
 * Returns array of { locale, url } pairs.
 */
function detectHreflangTags(html: string): Array<{ locale: string; url: string }> {
  const results: Array<{ locale: string; url: string }> = [];
  // hreflang before href
  const pattern1 = /<link[^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  // href before hreflang
  const pattern2 = /<link[^>]+href=["']([^"']+)["'][^>]+hreflang=["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern1.exec(html)) !== null) {
    const locale = match[1].toLowerCase();
    if (locale !== 'x-default') {
      results.push({ locale, url: match[2] });
    }
  }
  while ((match = pattern2.exec(html)) !== null) {
    const locale = match[2].toLowerCase();
    if (locale !== 'x-default') {
      results.push({ locale, url: match[1] });
    }
  }

  return results;
}

// ── Prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a localization quality analyst specializing in persuasive copy. You compare the persuasive structure of translated page versions to detect when translation weakens the sales message.

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;

function buildLocalizationPrompt(
  primaryLocale: string,
  comparedLocale: string,
  primaryCopy: string,
  translatedCopy: string,
): string {
  return `Compare the persuasive structure of these two page versions. Did the translation preserve or weaken the sales message?

Evaluate whether the translation preserved:
1. **Urgency language**: Time-sensitivity, scarcity cues, deadline language
2. **Social proof specificity**: Named customers, specific metrics, detailed results
3. **CTA power**: Action-oriented verbs, value-laden button text, specificity
4. **Value prop framing**: Benefit orientation, outcome language, emotional resonance

Or did it become generic/literal?

Respond with ONLY a JSON object matching this exact schema:
{
  "quality_score": <number 0-100, overall localization persuasion quality>,
  "preserved": ["<list of persuasive elements that WERE preserved: urgency, social_proof_specificity, cta_power, value_prop_framing>"],
  "lost_in_translation": ["<list of persuasive elements that were WEAKENED or lost>"],
  "issues": [{"element": "<which element>", "primary": "<original text>", "translated": "<translated text>", "problem": "<what went wrong>"}],
  "confidence": <number 0-100>
}

PRIMARY VERSION (${primaryLocale}):
${primaryCopy}

TRANSLATED VERSION (${comparedLocale}):
${translatedCopy}`;
}

// ── Response parsing ───────────────────────────

function parseAssessment(
  raw: string,
  primaryLocale: string,
  comparedLocale: string,
): LocalizationQualityAnalysis | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.quality_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      quality_score: Math.max(0, Math.min(100, parsed.quality_score)),
      primary_locale: primaryLocale,
      compared_locale: comparedLocale,
      preserved: Array.isArray(parsed.preserved)
        ? parsed.preserved.filter((s: unknown) => typeof s === "string")
        : [],
      lost_in_translation: Array.isArray(parsed.lost_in_translation)
        ? parsed.lost_in_translation.filter((s: unknown) => typeof s === "string")
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.slice(0, 10).map((i: Record<string, unknown>) => ({
            element: String(i.element || ""),
            primary: String(i.primary || ""),
            translated: String(i.translated || ""),
            problem: String(i.problem || ""),
          }))
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

// ── Copy elements serializer ──────────────────

function serializeCopyForComparison(ce: CopyElementsPayload): string {
  const parts: string[] = [];
  parts.push(`URL: ${ce.url}`);
  if (ce.h1) parts.push(`H1: ${ce.h1}`);
  if (ce.subheadline) parts.push(`Subheadline: ${ce.subheadline}`);
  if (ce.primary_cta) parts.push(`Primary CTA: ${ce.primary_cta}`);
  if (ce.cta_texts.length > 0)
    parts.push(`All CTAs: ${ce.cta_texts.join(" | ")}`);
  if (ce.social_proof_elements.length > 0)
    parts.push(`Social proof: ${ce.social_proof_elements.join(" | ")}`);
  if (ce.trust_signals.length > 0)
    parts.push(`Trust signals: ${ce.trust_signals.join(" | ")}`);
  if (ce.urgency_indicators.length > 0)
    parts.push(`Urgency: ${ce.urgency_indicators.join(" | ")}`);
  parts.push(`Above fold: ${ce.above_fold_text}`);
  parts.push(`Body: ${ce.body_text.slice(0, 1500)}`);
  return parts.join("\n");
}

// ── Main entry point ───────────────────────────

/**
 * Detect multi-locale sites and analyze localization quality.
 *
 * Called from semantic-enrichment.ts AFTER all per-page enrichments.
 * Checks for hreflang tags or URL locale prefixes, then if found,
 * fetches alternate-locale versions and compares persuasive structure.
 *
 * @param ctx             Enrichment context
 * @param pageContentEvidence  All page content evidence items
 * @param evidenceAdded   Output array to append new evidence to
 * @param budget          Shared budget tracker
 */
export async function runLocalizationQualityEnrichment(
  ctx: EnrichmentContext,
  pageContentEvidence: Evidence[],
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
): Promise<void> {
  if (!isLlmEnabled()) return;
  if (budget.remaining <= 0) return;

  // Step 1: Detect if this is a multi-locale site
  //
  // Strategy A: Check URL patterns for locale prefixes
  const localesByPath = new Map<string, Map<string, Evidence>>();
  let hasLocalePrefix = false;

  for (const e of pageContentEvidence) {
    const p = e.payload as PageContentPayload;
    const locale = detectLocaleFromUrl(p.url);
    if (locale) {
      hasLocalePrefix = true;
      const normPath = normalizePathWithoutLocale(p.url);
      if (!localesByPath.has(normPath)) {
        localesByPath.set(normPath, new Map());
      }
      localesByPath.get(normPath)!.set(locale, e);
    }
  }

  // Strategy B: Check for hreflang tags in one of the pages
  let hreflangDetected = false;
  const hreflangPairs: Array<{ primaryUrl: string; altLocale: string; altUrl: string }> = [];

  if (!hasLocalePrefix && pageContentEvidence.length > 0) {
    // Sample up to 3 pages to check for hreflang
    const sampled = pageContentEvidence.slice(0, 3);
    for (const e of sampled) {
      const p = e.payload as PageContentPayload;
      try {
        const resp = await httpFetch(p.url);
        if (resp.status_code < 400 && resp.body) {
          const tags = detectHreflangTags(resp.body);
          if (tags.length >= 2) {
            hreflangDetected = true;
            for (const tag of tags.slice(1)) {
              hreflangPairs.push({
                primaryUrl: p.url,
                altLocale: tag.locale,
                altUrl: tag.url,
              });
            }
            break; // One page is enough to confirm multi-locale
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }

  if (!hasLocalePrefix && !hreflangDetected) {
    return; // Not a multi-locale site
  }

  ctx.emit({
    type: "step",
    stage: "enrichment",
    data: {
      message: `Wave 3.10: localization quality analysis — multi-locale site detected (${hasLocalePrefix ? 'URL prefixes' : 'hreflang tags'})`,
      index: budget.processed + 1,
    },
    timestamp: new Date(),
  });

  // Step 2: Build pairs for comparison
  const pairs: Array<{
    primaryLocale: string;
    comparedLocale: string;
    primaryCopy: CopyElementsPayload;
    translatedCopy: CopyElementsPayload;
  }> = [];

  if (hasLocalePrefix) {
    for (const [, locales] of localesByPath) {
      if (locales.size < 2) continue;

      const localeKeys = Array.from(locales.keys());
      const primaryLocale = localeKeys.find(l => l.startsWith('en')) || localeKeys[0];

      for (const [locale, evidence] of locales) {
        if (locale === primaryLocale) continue;

        const p = evidence.payload as PageContentPayload;
        const primaryEvidence = locales.get(primaryLocale)!;
        const pp = primaryEvidence.payload as PageContentPayload;

        try {
          const [primaryResp, altResp] = await Promise.all([
            httpFetch(pp.url),
            httpFetch(p.url),
          ]);

          if (primaryResp.status_code >= 400 || altResp.status_code >= 400) continue;

          const primaryCopy = extractCopyElements(primaryResp.body, pp.url, 'all_commercial', 'awareness');
          const translatedCopy = extractCopyElements(altResp.body, p.url, 'all_commercial', 'awareness');

          pairs.push({ primaryLocale, comparedLocale: locale, primaryCopy, translatedCopy });
        } catch {
          // Non-fatal
        }
      }
    }
  } else if (hreflangDetected) {
    for (const pair of hreflangPairs.slice(0, 3)) {
      try {
        const [primaryResp, altResp] = await Promise.all([
          httpFetch(pair.primaryUrl),
          httpFetch(pair.altUrl),
        ]);

        if (primaryResp.status_code >= 400 || altResp.status_code >= 400) continue;

        const primaryLang = detectLocaleFromUrl(pair.primaryUrl) || 'en';
        const primaryCopy = extractCopyElements(primaryResp.body, pair.primaryUrl, 'all_commercial', 'awareness');
        const translatedCopy = extractCopyElements(altResp.body, pair.altUrl, 'all_commercial', 'awareness');

        pairs.push({
          primaryLocale: primaryLang,
          comparedLocale: pair.altLocale,
          primaryCopy,
          translatedCopy,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  if (pairs.length === 0) return;

  // Step 3: Run Haiku comparison for each pair (up to budget)
  const cap = Math.min(pairs.length, budget.remaining);

  for (let i = 0; i < cap; i++) {
    const pair = pairs[i];
    budget.processed++;
    budget.remaining--;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: localization quality (${i + 1}/${cap}) — ${pair.primaryLocale} vs ${pair.comparedLocale}`,
        index: budget.processed,
      },
      timestamp: new Date(),
    });

    try {
      const primaryText = serializeCopyForComparison(pair.primaryCopy);
      const translatedText = serializeCopyForComparison(pair.translatedCopy);

      const result = await callModel(
        "haiku_4_5",
        [{
          role: "user",
          content: buildLocalizationPrompt(
            pair.primaryLocale,
            pair.comparedLocale,
            primaryText,
            translatedText,
          ),
        }],
        {
          max_tokens: 1500,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
        },
      );

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(`[copy-localization ${ctx.cycle_ref}] no text in LLM response`);
        continue;
      }

      const assessment = parseAssessment(
        textBlock.text,
        pair.primaryLocale,
        pair.comparedLocale,
      );
      if (!assessment) {
        console.warn(`[copy-localization ${ctx.cycle_ref}] failed to parse LLM response`);
        continue;
      }

      const now = new Date();
      const sourceUrl = pair.translatedCopy.url;

      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "localization_quality",
        source_evidence_key: `localization_quality:${pair.primaryLocale}:${pair.comparedLocale}`,
        source_url: sourceUrl,
        scores: {
          clarity_score: assessment.quality_score,
          readability_grade: `${pair.primaryLocale} vs ${pair.comparedLocale}`,
        },
        flags: {
          ambiguity_flags: assessment.lost_in_translation.map(
            (l) => `Lost in translation: ${l}`,
          ),
          regulatory_gaps: [],
        },
        missing_elements: assessment.lost_in_translation,
        results: {
          quality_score: assessment.quality_score,
          primary_locale: assessment.primary_locale,
          compared_locale: assessment.compared_locale,
          preserved: assessment.preserved,
          lost_in_translation: assessment.lost_in_translation,
          issues: assessment.issues,
        },
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_localization_quality_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:localization_quality:${sourceUrl}`,
        evidence_type: EvidenceType.ContentEnrichment,
        subject_ref: ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
        scoping: ctx.scoping,
        cycle_ref: ctx.cycle_ref,
        freshness: {
          observed_at: now,
          fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          freshness_state: FreshnessState.Fresh,
          staleness_reason: null,
        },
        source_kind: SourceKind.HttpFetch,
        collection_method: CollectionMethod.ApiCall,
        payload: enrichmentPayload,
        quality_score: assessment.confidence,
        created_at: now,
        updated_at: now,
      };

      evidenceAdded.push(evidence);

      console.log(
        `[copy-localization ${ctx.cycle_ref}] ${pair.primaryLocale} vs ${pair.comparedLocale}: score=${assessment.quality_score}/100, preserved=${assessment.preserved.length}, lost=${assessment.lost_in_translation.length}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[copy-localization ${ctx.cycle_ref}] error: ${message}`);
    }
  }
}
