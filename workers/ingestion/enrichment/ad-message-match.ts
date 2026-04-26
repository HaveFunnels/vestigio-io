import { httpFetch } from "../http-client";
import { extractBodyText } from "../parser";
import { callModel, isLlmEnabled } from "../../../apps/mcp/llm/client";
import type {
  Evidence,
  ContentEnrichmentPayload,
  PageContentPayload,
  Scoping,
} from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";
import type { IntegrationSnapshot } from "../../../packages/integrations/types";
import type {
  MetaAdsSnapshotData,
  GoogleAdsSnapshotData,
} from "../../../packages/integrations/types";

// ──────────────────────────────────────────────
// Wave 3.9 C-E — Ad-LP Message-Match Analysis
//
// LLM-powered comparison of ad creative promises vs landing
// page content. Called from run-cycle.ts after integration
// polling completes, before recomputeAll().
//
// Unique differentiator: "your ad says X, your LP delivers Y,
// and you're wasting $Z/month on the disconnect."
//
// Cost control: max 5 ad-LP pairs per cycle, top by spend.
// Graceful degradation: returns [] when LLM disabled.
// ──────────────────────────────────────────────

/** Max ad-LP pairs to analyze per cycle (cost cap) */
const MAX_AD_LP_PAIRS = 5;

/** Max body text chars sent to the LLM per page */
const MAX_LP_TEXT_CHARS = 6_000;

// ── Types ───────────────────────────────────

interface AdLpPair {
  platform: "meta_ads" | "google_ads";
  ad_id: string;
  ad_headline: string;
  ad_body: string;
  ad_cta: string;
  destination_url: string;
  spend_30d: number;
  currency: string;
}

interface MessageMatchAssessment {
  alignment_score: number;
  headline_echoes_ad: boolean;
  cta_type_matches: boolean;
  value_proposition_consistent: boolean;
  misleading_claims: boolean;
  mismatch_points: string[];
  fix_suggestions: string[];
  confidence: number;
}

// ── Prompt ──────────────────────────────────

const SYSTEM_PROMPT = `You are an ad-landing-page consistency analyst. You compare the promise made in a paid ad creative against the actual content delivered on the landing page. You detect mismatches that waste ad spend.

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;

function buildUserPrompt(
  pair: AdLpPair,
  lpTitle: string | null,
  lpH1: string | null,
  lpMetaDesc: string | null,
  lpBody: string,
): string {
  return `Compare this ad creative against its landing page. Does the landing page deliver on the ad's promise?

AD CREATIVE (${pair.platform === "meta_ads" ? "Meta Ads" : "Google Ads"}):
- Headline: ${pair.ad_headline}
- Body: ${pair.ad_body}
- CTA: ${pair.ad_cta}
- Monthly spend: $${pair.spend_30d.toFixed(0)}

LANDING PAGE (${pair.destination_url}):
- Title: ${lpTitle || "(not available)"}
- H1: ${lpH1 || "(not available)"}
- Meta Description: ${lpMetaDesc || "(not available)"}
- Body Content (first ${MAX_LP_TEXT_CHARS} chars):
${lpBody}

Respond with ONLY a JSON object matching this exact schema:
{
  "alignment_score": <number 0-100, how well the LP delivers on the ad's promise>,
  "headline_echoes_ad": <boolean, does the LP headline/H1 echo the ad's main promise>,
  "cta_type_matches": <boolean, does the LP's primary CTA match the ad's CTA intent>,
  "value_proposition_consistent": <boolean, is the core value prop the same>,
  "misleading_claims": <boolean, does the ad make claims the LP cannot substantiate>,
  "mismatch_points": [<list of specific mismatches found, max 5>],
  "fix_suggestions": [<list of actionable fixes, max 3>],
  "confidence": <number 0-100>
}`;
}

// ── Pair extraction ─────────────────────────

export function extractAdLpPairs(
  snapshots: readonly IntegrationSnapshot[],
): AdLpPair[] {
  const pairs: AdLpPair[] = [];

  for (const snap of snapshots) {
    if (snap.provider === "meta_ads") {
      const data = snap.data as MetaAdsSnapshotData;
      for (const c of data.creatives || []) {
        if (!c.destination_url || c.status !== "ACTIVE") continue;
        pairs.push({
          platform: "meta_ads",
          ad_id: c.id,
          ad_headline: c.headline || "",
          ad_body: c.body || "",
          ad_cta: c.cta || "",
          destination_url: c.destination_url,
          spend_30d: c.spend_30d || 0,
          currency: data.currency || "USD",
        });
      }
    } else if (snap.provider === "google_ads") {
      const data = snap.data as GoogleAdsSnapshotData;
      for (const campaign of data.campaigns || []) {
        if (!campaign.final_url) continue;
        pairs.push({
          platform: "google_ads",
          ad_id: campaign.id,
          ad_headline: (campaign.headlines || []).join(" | "),
          ad_body: (campaign.descriptions || []).join(" | "),
          ad_cta: "LEARN_MORE", // Google RSAs don't expose CTA type
          destination_url: campaign.final_url,
          spend_30d: campaign.spend_30d || 0,
          currency: data.currency || "USD",
        });
      }
    }
  }

  // Deduplicate by destination URL — aggregate spend
  const byUrl = new Map<string, AdLpPair>();
  for (const pair of pairs) {
    const normalized = pair.destination_url.replace(/\/$/, "").toLowerCase();
    const existing = byUrl.get(normalized);
    if (existing) {
      existing.spend_30d += pair.spend_30d;
      // Keep the pair with the higher spend as the primary (for headline/body)
      if (pair.spend_30d > existing.spend_30d - pair.spend_30d) {
        existing.ad_headline = pair.ad_headline;
        existing.ad_body = pair.ad_body;
        existing.ad_cta = pair.ad_cta;
        existing.platform = pair.platform;
        existing.ad_id = pair.ad_id;
      }
    } else {
      byUrl.set(normalized, { ...pair });
    }
  }

  // Sort by spend descending, take top N
  return Array.from(byUrl.values())
    .filter((p) => p.spend_30d > 0 && (p.ad_headline || p.ad_body))
    .sort((a, b) => b.spend_30d - a.spend_30d)
    .slice(0, MAX_AD_LP_PAIRS);
}

// ── Response parsing ────────────────────────

function parseAssessment(raw: string): MessageMatchAssessment | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.alignment_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      alignment_score: Math.max(0, Math.min(100, parsed.alignment_score)),
      headline_echoes_ad: !!parsed.headline_echoes_ad,
      cta_type_matches: !!parsed.cta_type_matches,
      value_proposition_consistent: !!parsed.value_proposition_consistent,
      misleading_claims: !!parsed.misleading_claims,
      mismatch_points: Array.isArray(parsed.mismatch_points)
        ? parsed.mismatch_points.slice(0, 5).map(String)
        : [],
      fix_suggestions: Array.isArray(parsed.fix_suggestions)
        ? parsed.fix_suggestions.slice(0, 3).map(String)
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

// ── Main entry point ────────────────────────

/**
 * Analyze ad creative → landing page message alignment.
 *
 * Called from run-cycle.ts after integration polling completes.
 * Returns Evidence[] to be appended to result.evidence before
 * recomputeAll() so the signal engine can see the enrichments.
 */
export async function analyzeAdMessageMatch(
  integrationSnapshots: readonly IntegrationSnapshot[],
  existingEvidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Promise<Evidence[]> {
  if (!isLlmEnabled()) return [];

  const pairs = extractAdLpPairs(integrationSnapshots);
  if (pairs.length === 0) return [];

  // Build a lookup of existing PageContent evidence by URL for LP metadata
  const pageContentByUrl = new Map<string, PageContentPayload>();
  for (const ev of existingEvidence) {
    if (ev.evidence_type === EvidenceType.PageContent) {
      const p = ev.payload as PageContentPayload;
      if (p.url) {
        pageContentByUrl.set(p.url.replace(/\/$/, "").toLowerCase(), p);
      }
    }
  }

  const evidenceAdded: Evidence[] = [];
  let pairsProcessed = 0;

  for (const pair of pairs) {
    try {
      // Fetch LP body text
      const response = await httpFetch(pair.destination_url);
      if (response.status_code >= 400) {
        console.warn(
          `[ad-message-match ${cycleRef}] ${pair.destination_url} returned ${response.status_code}, skipping`,
        );
        continue;
      }

      const bodyText = extractBodyText(response.body);
      if (!bodyText || bodyText.length < 50) {
        console.warn(
          `[ad-message-match ${cycleRef}] ${pair.destination_url} has insufficient body text, skipping`,
        );
        continue;
      }

      const truncatedText = bodyText.slice(0, MAX_LP_TEXT_CHARS);

      // Get LP metadata from existing evidence (if crawled)
      const normalizedUrl = pair.destination_url
        .replace(/\/$/, "")
        .toLowerCase();
      const pageContent = pageContentByUrl.get(normalizedUrl);

      // Call Haiku
      const result = await callModel(
        "haiku_4_5",
        [
          {
            role: "user",
            content: buildUserPrompt(
              pair,
              pageContent?.title ?? null,
              pageContent?.h1 ?? null,
              pageContent?.meta_description ?? null,
              truncatedText,
            ),
          },
        ],
        {
          max_tokens: 1024,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
        },
      );

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(
          `[ad-message-match ${cycleRef}] no text in LLM response for ${pair.destination_url}`,
        );
        continue;
      }

      const assessment = parseAssessment(textBlock.text);
      if (!assessment) {
        console.warn(
          `[ad-message-match ${cycleRef}] failed to parse LLM response for ${pair.destination_url}`,
        );
        continue;
      }

      // Build ContentEnrichmentPayload evidence
      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "ad_message_match",
        source_evidence_key: `ad_message_match:${pair.platform}:${pair.ad_id}`,
        source_url: pair.destination_url,
        scores: {
          clarity_score: assessment.alignment_score,
          readability_grade: "n/a",
        },
        flags: {
          ambiguity_flags: assessment.mismatch_points,
          regulatory_gaps: [],
        },
        missing_elements: [],
        results: {
          alignment_score: assessment.alignment_score,
          headline_echoes_ad: assessment.headline_echoes_ad,
          cta_type_matches: assessment.cta_type_matches,
          value_proposition_consistent: assessment.value_proposition_consistent,
          misleading_claims: assessment.misleading_claims,
          mismatch_points: assessment.mismatch_points,
          fix_suggestions: assessment.fix_suggestions,
          ad_headline: pair.ad_headline,
          ad_body: pair.ad_body,
          ad_cta: pair.ad_cta,
          platform: pair.platform,
          spend_30d: pair.spend_30d,
          currency: pair.currency,
        },
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `ad_match_${pairsProcessed}_${Date.now()}`,
        evidence_key: `ad_message_match:${pair.platform}:${pair.destination_url}`,
        evidence_type: EvidenceType.ContentEnrichment,
        subject_ref: scoping.subject_ref || `website:unknown`,
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

      evidenceAdded.push(evidence);
      pairsProcessed++;

      console.log(
        `[ad-message-match ${cycleRef}] ${pair.platform} → ${pair.destination_url}: alignment=${assessment.alignment_score}/100, spend=$${pair.spend_30d.toFixed(0)}/mo`,
      );
    } catch (pairErr) {
      const message =
        pairErr instanceof Error ? pairErr.message : String(pairErr);
      console.warn(
        `[ad-message-match ${cycleRef}] error processing ${pair.destination_url}: ${message}`,
      );
    }
  }

  return evidenceAdded;
}
