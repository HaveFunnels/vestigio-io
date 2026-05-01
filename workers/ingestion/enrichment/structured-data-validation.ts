import type { Evidence, ContentEnrichmentPayload, PageContentPayload } from "../../../packages/domain";
import { EvidenceType, SourceKind, CollectionMethod, FreshnessState } from "../../../packages/domain";
import type { EnrichmentContext } from "./types";
import { extractBodyText } from "../parser";
import { httpFetch } from "../http-client";

// ──────────────────────────────────────────────
// Wave 4.2C — Structured Data Cross-Validation
//
// Compares JSON-LD claims against visible page content.
// Pure heuristic (no LLM) — extracts JSON-LD from HTML
// and compares claims against what the page actually shows.
//
// Checks:
//   - schema.name vs page h1/title
//   - schema.offers.price vs visible price on page
//   - schema.aggregateRating.ratingValue vs visible rating
// ──────────────────────────────────────────────

interface MismatchDetail {
  field: string;
  schema_value: string;
  page_value: string;
}

/**
 * Run structured data cross-validation on pages that have JSON-LD.
 * Returns Evidence[] with enrichment_type: 'structured_data_validation'.
 */
export async function runStructuredDataValidation(
  ctx: EnrichmentContext,
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
): Promise<void> {
  // Collect pages with structured data evidence (we know they have JSON-LD)
  const pagesWithStructuredData = new Set<string>();
  const pageContentByUrl = new Map<string, PageContentPayload>();

  for (const e of ctx.evidence) {
    if (e.evidence_type === EvidenceType.StructuredDataItem) {
      const p = e.payload as { page_url: string };
      pagesWithStructuredData.add(p.page_url);
    }
    if (e.evidence_type === EvidenceType.PageContent) {
      const p = e.payload as PageContentPayload;
      pageContentByUrl.set(p.url, p);
    }
  }

  if (pagesWithStructuredData.size === 0) return;

  // Process each page with structured data (capped by budget)
  for (const url of pagesWithStructuredData) {
    if (budget.remaining <= 0) break;

    const pageContent = pageContentByUrl.get(url);
    if (!pageContent) continue;

    // Fetch page body to extract JSON-LD and visible content
    let html: string | null = null;
    let bodyText: string | null = null;
    try {
      const resp = await httpFetch(url);
      if (resp.status_code < 400 && resp.body) {
        html = resp.body;
        bodyText = extractBodyText(resp.body);
      }
    } catch {
      continue; // Non-fatal — skip this page
    }

    if (!html || !bodyText) continue;

    // Extract JSON-LD blocks from HTML
    const jsonLdBlocks = extractJsonLd(html);
    if (jsonLdBlocks.length === 0) continue;

    const mismatches: MismatchDetail[] = [];

    for (const data of jsonLdBlocks) {
      // Check name vs h1/title
      const schemaName = data.name || data.headline;
      if (schemaName && typeof schemaName === 'string') {
        const h1 = pageContent.h1;
        const title = pageContent.title;
        if (h1 && !fuzzyContains(bodyText, schemaName) && !fuzzyContains(h1, schemaName)) {
          mismatches.push({
            field: 'name',
            schema_value: schemaName.slice(0, 80),
            page_value: (h1 || title || '').slice(0, 80),
          });
        }
      }

      // Check price vs visible price
      const offers = data.offers;
      if (offers) {
        const price = extractPrice(offers);
        if (price && !bodyText.includes(price)) {
          // Try common price formats
          const numericPrice = parseFloat(price.replace(/[^0-9.]/g, ''));
          if (!isNaN(numericPrice) && !bodyText.includes(String(numericPrice))) {
            mismatches.push({
              field: 'price',
              schema_value: price,
              page_value: '(not found on page)',
            });
          }
        }
      }

      // Check aggregateRating vs visible rating
      const rating = data.aggregateRating;
      if (rating && rating.ratingValue) {
        const ratingStr = String(rating.ratingValue);
        if (!bodyText.includes(ratingStr)) {
          mismatches.push({
            field: 'rating',
            schema_value: ratingStr,
            page_value: '(not found on page)',
          });
        }
      }
    }

    if (mismatches.length > 0) {
      const now = new Date();
      const evidence: Evidence = {
        id: `enrich_sdv_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:structured_data_validation:${url}`,
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
        quality_score: 75,
        payload: {
          type: 'content_enrichment',
          enrichment_type: 'structured_data_validation',
          source_evidence_key: `structured_data_${url}`,
          source_url: url,
          scores: { clarity_score: 0, readability_grade: 'n/a' },
          flags: { ambiguity_flags: [], regulatory_gaps: [] },
          missing_elements: [],
          results: {
            mismatches_found: mismatches.length,
            mismatch_details: mismatches,
            severity: mismatches.length >= 3 ? 'high' : mismatches.length >= 2 ? 'medium' : 'low',
          },
          confidence: 75,
          model_used: 'heuristic',
          cached: false,
        } as ContentEnrichmentPayload,
        created_at: now,
        updated_at: now,
      };

      evidenceAdded.push(evidence);
      budget.processed++;
      budget.remaining--;
    }
  }
}

/** Extract JSON-LD objects from HTML */
function extractJsonLd(html: string): Record<string, any>[] {
  const results: Record<string, any>[] = [];
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === 'object') results.push(item);
        }
      } else if (data && data['@graph'] && Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) {
          if (item && typeof item === 'object') results.push(item);
        }
      } else if (data && typeof data === 'object') {
        results.push(data);
      }
    } catch {
      // Invalid JSON-LD — skip
    }
  }

  return results;
}

/** Fuzzy containment check — case-insensitive, ignores extra whitespace */
function fuzzyContains(text: string, needle: string): boolean {
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
  const normalizedNeedle = needle.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedNeedle.length < 3) return true; // Too short to be meaningful
  return normalizedText.includes(normalizedNeedle);
}

/** Extract price from schema offers (handles single offer and array) */
function extractPrice(offers: any): string | null {
  if (Array.isArray(offers)) {
    if (offers.length > 0 && offers[0].price) return String(offers[0].price);
  } else if (offers.price) {
    return String(offers.price);
  } else if (offers.lowPrice) {
    return String(offers.lowPrice);
  }
  return null;
}
