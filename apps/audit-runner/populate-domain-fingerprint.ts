// ──────────────────────────────────────────────
// Domain Fingerprint Populator (Wave 19c)
//
// Runs at the end of a COLD cycle. Snapshots the slow-changing
// "identity" of the domain into DomainFingerprint so the chat agent
// (and any other downstream consumer) can read invariant facts about
// the domain without re-deriving them every turn.
//
// Cost model:
//   - First run on a brand-new environment: 1 Haiku call (~$0.0001)
//     to classify the industry vertical.
//   - Subsequent cold cycles within 90 days: ZERO LLM calls — we
//     skip if a fresh row already exists.
//   - Quarterly refresh: 1 Haiku call again.
//
// Failure mode: best-effort. If the LLM is down or the homepage is
// missing from this cycle, we log and skip — the next cold cycle
// will retry. Never throws; never blocks cycle completion.
//
// What we read from the current cycle:
//   - PageContent evidence for the homepage (for industry prompt)
//   - PlatformIndicator evidence (regex hits for tech stack)
//
// We do NOT yet capture ai-bot policy here — that lives in OffSiteRecon
// evidence with its own freshness gate. Adding it would be a copy-paste
// from external-recon.ts; left for a follow-up.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { callModel, isLlmEnabled } from "../mcp/llm/client";

const REFRESH_AFTER_DAYS = 90;

function safeJsonParse(s: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? v : undefined;
  } catch {
    return undefined;
  }
}

interface PopulateInput {
  prisma: PrismaClient;
  organizationId: string;
  envId: string;
  cycleId: string;
  cycleMode: "hot" | "warm" | "cold";
  domain: string;
}

interface IndustryClassification {
  industry: string;
  confidence: number;
}

const INDUSTRY_SYSTEM_PROMPT = `You classify a website's industry vertical from its homepage copy. The output is read by an AI chat agent on every customer interaction for the lifetime of the env. A generic label reduces every downstream answer to a cliché.

GOOD output. 3-6 words, specific enough that a salesperson would lead with it:
- "B2B SaaS - sales analytics"
- "D2C beauty - organic skincare"
- "marketplace - freelance services"
- "fintech - SMB payment processing"
- "info-product - SaaS founder education"
- "e-commerce - athleisure for women"

AVOID. These are too generic and downgrade every downstream finding to vague advice:
- "e-commerce" alone (which segment? fashion? food? B2B?)
- "SaaS" alone (B2B vs B2C? horizontal vs vertical? what category?)
- "technology company" (fits 80% of the internet)
- "online business" (says nothing actionable)
- "consulting" (consulting WHAT? for WHOM?)

Format priority when ambiguous: buyer model (B2B / D2C / marketplace / info-product) + product category + audience segment.

Always reply with valid JSON only. Confidence reflects how certain you are about ALL THREE. Buyer model, category, audience. If you can only nail two of three, drop the score below 70.`;

function buildIndustryPrompt(domain: string, homepageH1: string, homepageMeta: string, homepageAboveFold: string): string {
  return `Classify the industry of this domain.

Domain: ${domain}
Homepage H1: ${homepageH1 || "(none)"}
Meta description: ${homepageMeta || "(none)"}
Above-the-fold copy: ${homepageAboveFold.slice(0, 600)}

Reply with ONLY a JSON object:
{
  "industry": "<3-6 word specific industry label>",
  "confidence": <0-100>
}`;
}

function parseIndustryResponse(raw: string): IndustryClassification | null {
  try {
    const start = raw.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (typeof parsed.industry !== "string" || typeof parsed.confidence !== "number") return null;
    return {
      industry: parsed.industry.trim().slice(0, 100),
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
    };
  } catch {
    return null;
  }
}

export async function populateDomainFingerprint(input: PopulateInput): Promise<{
  skipped: boolean;
  reason?: string;
  classified: boolean;
}> {
  const { prisma, organizationId, envId, cycleId, cycleMode, domain } = input;

  if (cycleMode !== "cold") {
    return { skipped: true, reason: `cycle-mode=${cycleMode}`, classified: false };
  }

  // Existing row + freshness check. If we already have a row from the
  // last 90 days, we trust it — no LLM call needed.
  const existing = await prisma.domainFingerprint.findUnique({
    where: { environmentId: envId },
  }).catch(() => null);

  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000);
  if (existing && existing.industryClassifiedAt && existing.industryClassifiedAt > cutoff) {
    return { skipped: true, reason: "still-fresh", classified: false };
  }

  // Snapshot the deterministic bits from the current cycle's evidence.
  // These are cheap — string regex matches against PlatformIndicator
  // payloads — and don't gate on LLM availability.
  const cycleRef = `audit_cycle:${cycleId}`;
  const platformIndicators = await prisma.evidence.findMany({
    where: {
      evidenceType: "platform_indicator",
      cycleRef,
    },
    select: { payload: true },
    take: 50,
  }).catch(() => []);

  const detectedPlatforms = Array.from(
    new Set(
      platformIndicators
        .map((e: any) => e.payload?.platform_name)
        .filter((p: unknown): p is string => typeof p === "string"),
    ),
  );

  // Primary locale comes from the homepage page_content evidence.
  const homepageEvidence = await prisma.evidence.findFirst({
    where: {
      evidenceType: "page_content",
      cycleRef,
    },
    select: { payload: true },
    orderBy: { createdAt: "asc" },
  }).catch(() => null);

  // Evidence.payload is stored as `String @db.Text` (see Evidence model
  // in prisma/schema.prisma) and written via JSON.stringify in
  // packages/evidence/prisma-store.ts. Direct prisma reads — like this
  // one — get the raw JSON string, NOT the parsed object. Several call
  // sites get this wrong (treating the cast as a real parse) — we
  // defensively handle both shapes so this code keeps working if/when
  // the storage type ever migrates to native Json.
  //
  // Field name fix: the payload exposes `body_text_snippet` (per
  // PageContentPayload at packages/domain/evidence.ts:116, snippet of
  // visible body text up to ~2000 chars). The previous code reached
  // for `above_fold_text`, which doesn't exist on this payload — so
  // even when JSON.parse succeeded by accident, the field was always
  // undefined, h1+aboveFold length was always 0, and the industry
  // classifier silently skipped. Confirmed against havefunnels which
  // has had `industry: null` across 30+ days of cycles.
  const rawPayload = homepageEvidence?.payload;
  const homepagePayload: {
    url?: string;
    h1?: string;
    meta_description?: string;
    body_text_snippet?: string;
    lang?: string;
  } | undefined =
    typeof rawPayload === "string"
      ? safeJsonParse(rawPayload)
      : (rawPayload as any) || undefined;
  const primaryLocale = homepagePayload?.lang ?? null;

  // Industry classification — one Haiku call. Skipped if LLM is
  // disabled OR the homepage didn't yield enough copy to classify.
  let industry: string | null = null;
  let industryConfidence: number | null = null;
  let industryClassifiedAt: Date | null = null;

  if (isLlmEnabled() && homepagePayload) {
    const h1 = (homepagePayload.h1 || "").slice(0, 200);
    const meta = (homepagePayload.meta_description || "").slice(0, 300);
    const aboveFold = (homepagePayload.body_text_snippet || "").slice(0, 1000);

    if (h1.length + aboveFold.length >= 30) {
      try {
        const result = await callModel(
          "haiku_4_5",
          [{ role: "user", content: buildIndustryPrompt(domain, h1, meta, aboveFold) }],
          {
            max_tokens: 150,
            temperature: 0,
            system: INDUSTRY_SYSTEM_PROMPT,
          },
          {
            purpose: "domain_fingerprint.industry",
            organizationId,
            environmentId: envId,
            cycleId,
          },
        );
        const textBlock = result.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          const parsed = parseIndustryResponse(textBlock.text);
          if (parsed) {
            industry = parsed.industry;
            industryConfidence = parsed.confidence;
            industryClassifiedAt = new Date();
          }
        }
      } catch (err) {
        console.warn(
          `[domain-fingerprint] industry classification failed for env=${envId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Upsert. We keep prior industry on failure so we don't wipe a
  // previously good classification just because the current cycle's
  // homepage fetch was flaky.
  await prisma.domainFingerprint.upsert({
    where: { environmentId: envId },
    create: {
      environmentId: envId,
      detectedPlatforms,
      primaryLocale,
      industry,
      industryConfidence,
      industryClassifiedAt,
    },
    update: {
      detectedPlatforms,
      primaryLocale: primaryLocale ?? existing?.primaryLocale ?? null,
      ...(industry
        ? { industry, industryConfidence, industryClassifiedAt }
        : {}),
      refreshedAt: new Date(),
    },
  }).catch((err) => {
    console.warn(
      `[domain-fingerprint] upsert failed for env=${envId}:`,
      err instanceof Error ? err.message : err,
    );
  });

  return { skipped: false, classified: industry !== null };
}
