import { callModel, isLlmEnabled } from "../../../apps/mcp/llm/client";
import type {
  Evidence,
  ContentEnrichmentPayload,
  CopyElementsPayload,
  Scoping,
} from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";

// ──────────────────────────────────────────────
// Wave 3.10 Fase 3 — Cross-Page Narrative Consistency
//
// Haiku-powered analysis of copy elements across ALL commercial
// pages in a single cycle. Detects:
//   - Contradictory promises (page A says "free", page B has pricing)
//   - Tone shifts (formal vs casual across pages)
//   - Inconsistent naming (product called different things)
//   - Abandoned commitments (hero promises feature X, no page explains it)
//   - Value prop drift (different value props across pages)
//
// Minimum 3 commercial pages required to run (otherwise
// cross-page comparison is meaningless).
//
// Produces ContentEnrichmentPayload with enrichment_type: 'cross_page_consistency'
// Feeds signal `copy_tone_inconsistent` when consistency_score < 50
// ──────────────────────────────────────────────

/** Max pages to include in the cross-page prompt (cost control) */
const MAX_PAGES_FOR_CROSS_PAGE = 15;

/** Min pages needed to run cross-page analysis */
const MIN_PAGES_FOR_CROSS_PAGE = 3;

// ── Types ──────────────────────────────────────

export interface CrossPageAnalysis {
  consistency_score: number; // 0-100
  contradictions: Array<{
    page_a: string;
    page_b: string;
    claim_a: string;
    claim_b: string;
    type:
      | "contradiction"
      | "tone_shift"
      | "naming_inconsistency"
      | "abandoned_commitment"
      | "value_prop_drift";
  }>;
  overall_tone: string; // "formal" | "casual" | "mixed"
  strengths: string[];
}

// ── Prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a cross-page narrative consistency analyst. You compare copy elements across multiple pages of the same website to detect contradictions, tone shifts, naming inconsistencies, abandoned commitments, and value proposition drift.

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;

function buildCrossPagePrompt(
  pageSummaries: string,
  pageCount: number,
): string {
  return `Analyze the copy elements from ${pageCount} pages of the same website. Compare them for narrative consistency.

Detect:
1. **Contradictory promises**: Page A says "free forever" but Page B has pricing
2. **Tone shifts**: Page A is formal/corporate but Page B is casual/playful
3. **Inconsistent naming**: Product called different names on different pages
4. **Abandoned commitments**: Hero promises feature X but no page explains or delivers it
5. **Value prop drift**: Different pages pitch entirely different value propositions

Respond with ONLY a JSON object matching this exact schema:
{
  "consistency_score": <number 0-100, where 100 = perfectly consistent across all pages>,
  "contradictions": [
    {
      "page_a": "<URL of first page>",
      "page_b": "<URL of second page>",
      "claim_a": "<what page A says>",
      "claim_b": "<what page B says (contradicts or misaligns)>",
      "type": "<contradiction | tone_shift | naming_inconsistency | abandoned_commitment | value_prop_drift>"
    }
  ],
  "overall_tone": "<formal | casual | mixed>",
  "strengths": ["<list of things the site does well in terms of cross-page consistency>"],
  "confidence": <number 0-100>
}

PAGES:
${pageSummaries}`;
}

/** Build compact ~100 token summary per page for the prompt */
function buildPageSummary(copyElements: CopyElementsPayload): string {
  const parts: string[] = [];
  parts.push(`URL: ${copyElements.url}`);
  parts.push(`Type: ${copyElements.page_type} (${copyElements.funnel_stage})`);
  if (copyElements.h1) parts.push(`H1: ${copyElements.h1}`);
  if (copyElements.subheadline)
    parts.push(`Sub: ${copyElements.subheadline}`);
  if (copyElements.primary_cta)
    parts.push(`CTA: ${copyElements.primary_cta}`);
  // Include key claims from above-fold text (first 200 chars)
  if (copyElements.above_fold_text) {
    const claims = copyElements.above_fold_text.slice(0, 200).trim();
    if (claims) parts.push(`Claims: ${claims}`);
  }
  if (copyElements.trust_signals.length > 0) {
    parts.push(`Trust: ${copyElements.trust_signals.slice(0, 3).join(", ")}`);
  }
  return parts.join("\n");
}

// ── Response parsing ───────────────────────────

function parseAssessment(raw: string): (CrossPageAnalysis & { confidence: number }) | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.consistency_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      consistency_score: Math.max(0, Math.min(100, parsed.consistency_score)),
      contradictions: Array.isArray(parsed.contradictions)
        ? parsed.contradictions.slice(0, 20).map(
            (c: Record<string, unknown>) => ({
              page_a: String(c.page_a || ""),
              page_b: String(c.page_b || ""),
              claim_a: String(c.claim_a || ""),
              claim_b: String(c.claim_b || ""),
              type: validateContradictionType(String(c.type || "contradiction")),
            }),
          )
        : [],
      overall_tone: validateTone(String(parsed.overall_tone || "mixed")),
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((s: unknown) => typeof s === "string")
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

function validateContradictionType(
  type: string,
): CrossPageAnalysis["contradictions"][0]["type"] {
  const valid = [
    "contradiction",
    "tone_shift",
    "naming_inconsistency",
    "abandoned_commitment",
    "value_prop_drift",
  ];
  return valid.includes(type) ? (type as CrossPageAnalysis["contradictions"][0]["type"]) : "contradiction";
}

function validateTone(tone: string): string {
  return ["formal", "casual", "mixed"].includes(tone) ? tone : "mixed";
}

// ── Main entry point ───────────────────────────

/**
 * Analyze cross-page narrative consistency across all commercial pages.
 *
 * Called from semantic-enrichment.ts AFTER all per-page enrichments
 * complete. Takes collected CopyElementsPayload evidence from the
 * cycle and runs a single Haiku prompt comparing them.
 *
 * @param copyElementsByPage Copy elements indexed by page URL
 * @param scoping            Cycle scoping context
 * @param cycleRef           Cycle reference ID
 * @returns Evidence[] to be appended before recomputeAll()
 */
export async function analyzeCrossPageConsistency(
  copyElementsByPage: Map<string, CopyElementsPayload>,
  scoping: Scoping,
  cycleRef: string,
): Promise<Evidence[]> {
  if (!isLlmEnabled()) return [];

  // Need at least MIN_PAGES to make cross-page analysis meaningful
  if (copyElementsByPage.size < MIN_PAGES_FOR_CROSS_PAGE) {
    console.log(
      `[cross-page-copy ${cycleRef}] only ${copyElementsByPage.size} pages, need ${MIN_PAGES_FOR_CROSS_PAGE}+ for cross-page analysis`,
    );
    return [];
  }

  // Build page summaries (max MAX_PAGES, sorted by funnel stage to give
  // the LLM a logical reading order)
  const stageOrder: Record<string, number> = {
    awareness: 0,
    consideration: 1,
    decision: 2,
    retention: 3,
  };

  const entries = Array.from(copyElementsByPage.entries())
    .sort(
      ([, a], [, b]) =>
        (stageOrder[a.funnel_stage] ?? 99) - (stageOrder[b.funnel_stage] ?? 99),
    )
    .slice(0, MAX_PAGES_FOR_CROSS_PAGE);

  const pageSummaries = entries
    .map(([, copyElements], idx) => `--- Page ${idx + 1} ---\n${buildPageSummary(copyElements)}`)
    .join("\n\n");

  try {
    const result = await callModel(
      "haiku_4_5",
      [
        {
          role: "user",
          content: buildCrossPagePrompt(pageSummaries, entries.length),
        },
      ],
      {
        max_tokens: 1500,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
      },
    );

    const textBlock = result.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.warn(
        `[cross-page-copy ${cycleRef}] no text in LLM response`,
      );
      return [];
    }

    const assessment = parseAssessment(textBlock.text);
    if (!assessment) {
      console.warn(
        `[cross-page-copy ${cycleRef}] failed to parse LLM response`,
      );
      return [];
    }

    // Build ContentEnrichmentPayload evidence
    const now = new Date();
    const rootDomain = scoping.subject_ref?.replace("website:", "") || "unknown";

    const enrichmentPayload: ContentEnrichmentPayload = {
      type: "content_enrichment",
      enrichment_type: "cross_page_consistency",
      source_evidence_key: `cross_page_consistency:${rootDomain}`,
      source_url: rootDomain,
      scores: {
        clarity_score: assessment.consistency_score,
        readability_grade: assessment.overall_tone,
      },
      flags: {
        ambiguity_flags: assessment.contradictions.map(
          (c) => `${c.type}: "${c.claim_a}" vs "${c.claim_b}"`,
        ),
        regulatory_gaps: [],
      },
      missing_elements: [],
      results: {
        consistency_score: assessment.consistency_score,
        contradictions: assessment.contradictions,
        overall_tone: assessment.overall_tone,
        strengths: assessment.strengths,
        page_count: entries.length,
      },
      confidence: assessment.confidence,
      model_used: result.model,
      cached: false,
    };

    const evidence: Evidence = {
      id: `cross_page_consistency_${Date.now()}`,
      evidence_key: `content_enrichment:cross_page_consistency:${rootDomain}`,
      evidence_type: EvidenceType.ContentEnrichment,
      subject_ref: scoping.subject_ref || `website:${rootDomain}`,
      scoping,
      cycle_ref: cycleRef,
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

    console.log(
      `[cross-page-copy ${cycleRef}] consistency=${assessment.consistency_score}/100, contradictions=${assessment.contradictions.length}, tone=${assessment.overall_tone}`,
    );

    return [evidence];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[cross-page-copy ${cycleRef}] error: ${message}`,
    );
    return [];
  }
}
