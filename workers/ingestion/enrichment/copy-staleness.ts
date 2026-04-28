import { httpFetch } from "../http-client";
import { extractBodyText } from "../parser";
import type {
  Evidence,
  ContentEnrichmentPayload,
  PageContentPayload,
} from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";
import type { EnrichmentContext } from "./types";

// ──────────────────────────────────────────────
// Wave 3.10 Fase 4 — Item P: Copy Staleness
//
// Pure regex/pattern-matching function (no LLM call, zero cost).
// Detects outdated references in page copy:
//   - Past dates and years
//   - Expired promotions
//   - Copyright year mismatch
//   - Old social proof numbers
//   - Outdated temporal references
//
// Produces ContentEnrichmentPayload with enrichment_type: 'copy_staleness'
// Feeds signal `copy_stale_references` when staleness_score > 30
// ──────────────────────────────────────────────

// ── Types ──────────────────────────────────────

export interface CopyStalenessAnalysis {
  staleness_score: number; // 0-100
  stale_elements: Array<{
    type: 'past_date' | 'expired_promotion' | 'old_metric' | 'copyright_year' | 'outdated_reference';
    text: string;
    location: string; // URL or element description
    suggestion: string;
  }>;
}

// ── Current date reference ─────────────────────

function getCurrentYear(): number {
  return new Date().getFullYear();
}

function getCurrentMonth(): number {
  return new Date().getMonth() + 1; // 1-12
}

// ── Detection patterns ─────────────────────────

interface StaleElement {
  type: CopyStalenessAnalysis['stale_elements'][0]['type'];
  text: string;
  location: string;
  suggestion: string;
}

/**
 * Detect past year references in text.
 * Flags years that are 2+ years before current year.
 */
function detectPastDates(text: string, url: string): StaleElement[] {
  const currentYear = getCurrentYear();
  const results: StaleElement[] = [];

  // Match explicit year references (2019-2025 range, not in URLs or code)
  const yearPattern = /\b(20[1-2]\d)\b/g;
  let match: RegExpExecArray | null;

  while ((match = yearPattern.exec(text)) !== null) {
    const year = parseInt(match[1], 10);
    if (year < currentYear - 1) {
      // Check surrounding context to avoid false positives
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      const context = text.slice(start, end).trim();

      // Skip if it looks like a version number, ID, or code
      if (/v\d|version|id[=:]|#\d/i.test(context)) continue;
      // Skip if it is part of a range that includes current year
      if (new RegExp(`${year}\\s*[-\u2013]\\s*${currentYear}`).test(context)) continue;

      results.push({
        type: 'past_date',
        text: context,
        location: url,
        suggestion: `Reference to ${year} may be outdated. Update to ${currentYear} or remove the date reference.`,
      });
    }
  }

  // Match date patterns like "January 2024", "Dec 2023", etc.
  const dateMonthYearPattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20[1-2]\d)\b/gi;

  while ((match = dateMonthYearPattern.exec(text)) !== null) {
    const year = parseInt(match[2], 10);
    if (year < currentYear) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      const context = text.slice(start, end).trim();

      results.push({
        type: 'past_date',
        text: context,
        location: url,
        suggestion: `Date "${match[0]}" is in the past. Update or remove this temporal reference.`,
      });
    }
  }

  return results;
}

/**
 * Detect expired promotional references.
 */
function detectExpiredPromotions(text: string, url: string): StaleElement[] {
  const currentMonth = getCurrentMonth();
  const results: StaleElement[] = [];

  // "Black Friday" outside November-December
  if (/black\s*friday/i.test(text) && currentMonth > 1 && currentMonth < 11) {
    results.push({
      type: 'expired_promotion',
      text: 'Black Friday reference',
      location: url,
      suggestion: 'Black Friday promotion reference outside November/December. Remove or update to current promotion.',
    });
  }

  // "Cyber Monday" outside November-December
  if (/cyber\s*monday/i.test(text) && currentMonth > 1 && currentMonth < 11) {
    results.push({
      type: 'expired_promotion',
      text: 'Cyber Monday reference',
      location: url,
      suggestion: 'Cyber Monday promotion reference outside November/December. Remove or update.',
    });
  }

  // "New Year" promotions outside December-January
  if (/new\s*year['s]*\s*(sale|offer|deal|discount|promo)/i.test(text) && currentMonth > 2 && currentMonth < 12) {
    results.push({
      type: 'expired_promotion',
      text: 'New Year promotion reference',
      location: url,
      suggestion: 'New Year promotion reference outside December/January. Remove or update.',
    });
  }

  // "Summer sale" outside June-August
  if (/summer\s*(sale|offer|deal|discount|promo)/i.test(text) && (currentMonth < 5 || currentMonth > 9)) {
    results.push({
      type: 'expired_promotion',
      text: 'Summer sale reference',
      location: url,
      suggestion: 'Summer sale reference outside summer months. Update to current seasonal promotion.',
    });
  }

  // "ends [month]" or "expires [month]" patterns with past months
  const endsMonthPattern = /(?:ends?|expires?|valid\s+(?:until|through|thru))\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
  let match: RegExpExecArray | null;

  const monthMap: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  while ((match = endsMonthPattern.exec(text)) !== null) {
    const monthName = match[1].toLowerCase();
    const monthNum = monthMap[monthName];
    if (monthNum && monthNum < currentMonth - 1) {
      results.push({
        type: 'expired_promotion',
        text: match[0],
        location: url,
        suggestion: `Promotion "${match[0]}" references a past month. Remove or update the promotion.`,
      });
    }
  }

  // "last year" reference
  if (/\blast\s+year\b/i.test(text)) {
    results.push({
      type: 'outdated_reference',
      text: '"last year" reference',
      location: url,
      suggestion: 'Replace "last year" with the specific year or update the content.',
    });
  }

  // "recently" with old dates nearby
  const recentlyPattern = /\brecently\b.{0,50}(20[1-2]\d)\b/gi;
  while ((match = recentlyPattern.exec(text)) !== null) {
    const year = parseInt(match[1], 10);
    if (year < getCurrentYear() - 1) {
      results.push({
        type: 'outdated_reference',
        text: match[0].slice(0, 80),
        location: url,
        suggestion: `"recently" combined with ${year} is contradictory. Update the claim or remove "recently".`,
      });
    }
  }

  return results;
}

/**
 * Detect copyright year mismatch.
 */
function detectCopyrightYearMismatch(text: string, url: string): StaleElement[] {
  const currentYear = getCurrentYear();
  const results: StaleElement[] = [];

  // Match copyright patterns: (c) 2024, copyright 2024, etc. (not followed by dash = not a range)
  const copyrightPattern = /(?:\u00a9|\(c\)|copyright)\s*(20[1-2]\d)(?!\s*[-\u2013])/gi;
  let match: RegExpExecArray | null;

  while ((match = copyrightPattern.exec(text)) !== null) {
    const year = parseInt(match[1], 10);
    if (year < currentYear) {
      results.push({
        type: 'copyright_year',
        text: match[0],
        location: url,
        suggestion: `Copyright year ${year} is outdated. Update to ${currentYear} or use a range: ${year}-${currentYear}.`,
      });
    }
  }

  // Also match copyright ranges where end year is old: "2020-2024"
  const rangePattern = /(?:\u00a9|\(c\)|copyright)\s*\d{4}\s*[-\u2013]\s*(20[1-2]\d)/gi;

  while ((match = rangePattern.exec(text)) !== null) {
    const endYear = parseInt(match[1], 10);
    if (endYear < currentYear) {
      results.push({
        type: 'copyright_year',
        text: match[0],
        location: url,
        suggestion: `Copyright range end year ${endYear} is outdated. Update to ${currentYear}.`,
      });
    }
  }

  return results;
}

/**
 * Detect potentially stale social proof metrics.
 */
function detectOldMetrics(text: string, url: string): StaleElement[] {
  const results: StaleElement[] = [];

  // "trusted by X+ companies/customers/users" with suspiciously low numbers
  const metricPattern = /(?:trusted\s+by|used\s+by|loved\s+by|chosen\s+by|serving|over)\s+([\d,]+)\+?\s*(?:companies|customers|users|teams|businesses|brands|people)/gi;
  let match: RegExpExecArray | null;

  while ((match = metricPattern.exec(text)) !== null) {
    const numberStr = match[1].replace(/,/g, '');
    const number = parseInt(numberStr, 10);

    // Flag very small round numbers that look like old placeholders
    if (number > 0 && number <= 100 && number % 10 === 0) {
      results.push({
        type: 'old_metric',
        text: match[0],
        location: url,
        suggestion: `"${match[0]}" uses a small, round number that may be outdated. Verify and update to current numbers.`,
      });
    }
  }

  return results;
}

/**
 * Calculate staleness score based on detected elements.
 * Scoring logic:
 * - copyright_year: 15 points each (max 30)
 * - past_date: 10 points each (max 30)
 * - expired_promotion: 20 points each (max 40)
 * - old_metric: 10 points each (max 20)
 * - outdated_reference: 5 points each (max 15)
 */
function calculateStalenessScore(elements: StaleElement[]): number {
  let score = 0;

  const byType = new Map<string, number>();
  for (const el of elements) {
    byType.set(el.type, (byType.get(el.type) || 0) + 1);
  }

  score += Math.min(30, (byType.get('copyright_year') || 0) * 15);
  score += Math.min(30, (byType.get('past_date') || 0) * 10);
  score += Math.min(40, (byType.get('expired_promotion') || 0) * 20);
  score += Math.min(20, (byType.get('old_metric') || 0) * 10);
  score += Math.min(15, (byType.get('outdated_reference') || 0) * 5);

  return Math.min(100, score);
}

// ── Main entry point ───────────────────────────

/**
 * Run copy staleness detection on all pages (zero LLM cost).
 *
 * Called from semantic-enrichment.ts as a separate non-LLM pass.
 * Pure regex/pattern matching -- can run on every page.
 *
 * @param ctx             Enrichment context
 * @param pageContentEvidence  All page content evidence items
 * @param evidenceAdded   Output array to append new evidence to
 */
export async function runCopyStalenessEnrichment(
  ctx: EnrichmentContext,
  pageContentEvidence: Evidence[],
  evidenceAdded: Evidence[],
): Promise<void> {
  if (pageContentEvidence.length === 0) return;

  let totalStalePages = 0;

  for (const pageEvidence of pageContentEvidence) {
    const p = pageEvidence.payload as PageContentPayload;

    try {
      const response = await httpFetch(p.url);
      if (response.status_code >= 400) continue;

      const bodyText = extractBodyText(response.body);
      if (!bodyText || bodyText.length < 50) continue;

      // Run all detection patterns
      const staleElements: StaleElement[] = [
        ...detectPastDates(bodyText, p.url),
        ...detectExpiredPromotions(bodyText, p.url),
        ...detectCopyrightYearMismatch(bodyText, p.url),
        ...detectOldMetrics(bodyText, p.url),
      ];

      // Also check raw HTML for copyright in footer (often not in body text)
      const htmlLower = response.body.toLowerCase();
      const footerIdx = htmlLower.lastIndexOf('<footer');
      if (footerIdx !== -1) {
        const footerHtml = response.body.slice(footerIdx);
        const footerText = extractBodyText(footerHtml) || '';
        const footerCopyrightElements = detectCopyrightYearMismatch(footerText, p.url);
        for (const el of footerCopyrightElements) {
          if (!staleElements.some(e => e.type === el.type && e.text === el.text)) {
            staleElements.push(el);
          }
        }
      }

      // Only produce evidence if staleness detected
      if (staleElements.length === 0) continue;

      const stalenessScore = calculateStalenessScore(staleElements);
      totalStalePages++;

      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "copy_staleness",
        source_evidence_key: pageEvidence.evidence_key,
        source_url: p.url,
        scores: {
          clarity_score: 100 - stalenessScore,
          readability_grade: stalenessScore > 50 ? 'stale' : stalenessScore > 30 ? 'aging' : 'minor',
        },
        flags: {
          ambiguity_flags: staleElements.map(
            (el) => `${el.type}: ${el.text}`,
          ),
          regulatory_gaps: [],
        },
        missing_elements: [],
        results: {
          staleness_score: stalenessScore,
          stale_elements: staleElements,
          stale_element_count: staleElements.length,
        },
        confidence: 85,
        model_used: 'regex_parser',
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_copy_staleness_${totalStalePages}_${Date.now()}`,
        evidence_key: `content_enrichment:copy_staleness:${p.url}`,
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
        collection_method: CollectionMethod.StaticFetch,
        payload: enrichmentPayload,
        quality_score: 85,
        created_at: now,
        updated_at: now,
      };

      evidenceAdded.push(evidence);
    } catch (pageErr) {
      const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`[copy-staleness ${ctx.cycle_ref}] error for ${p.url}: ${message}`);
    }
  }

  if (totalStalePages > 0) {
    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: copy staleness scan complete -- ${totalStalePages} page(s) with stale content detected`,
        index: 0,
      },
      timestamp: new Date(),
    });

    console.log(
      `[copy-staleness ${ctx.cycle_ref}] detected stale content on ${totalStalePages} page(s)`,
    );
  }
}
