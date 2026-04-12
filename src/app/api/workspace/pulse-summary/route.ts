import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { isLlmEnabled } from "../../../../../apps/mcp/llm";
import { callModel } from "../../../../../apps/mcp/llm/client";

// ──────────────────────────────────────────────
// Pulse Summary API — POST /api/workspace/pulse-summary
//
// Generates a concise LLM briefing for a workspace
// perspective using Haiku. Cached in-memory (1h TTL)
// to avoid redundant calls within the same cycle.
// ──────────────────────────────────────────────

// ── Types ───────────────────────────────────────

type Perspective = "panorama" | "revenue" | "trust" | "behavior" | "copy";
type MaturityStage = "launch" | "growth" | "scale";
type Locale = "en" | "pt-BR" | "es" | "de";

interface Finding {
  title: string;
  severity: string;
  impact_estimate: string;
}

interface CycleDelta {
  improved: number;
  worsened: number;
  new: number;
}

interface PulseSummaryRequest {
  perspective: Perspective;
  findings: Finding[];
  positive_checks: string[];
  cycle_delta: CycleDelta;
  maturity_stage: MaturityStage;
  locale: Locale;
  environment_id?: string;
  cycle_ref?: string;
}

// ── In-memory cache (Map + TTL) ─────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  summary: string;
  created_at: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.created_at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.summary;
}

function setCache(key: string, summary: string): void {
  cache.set(key, { summary, created_at: Date.now() });

  // Periodic cleanup: evict expired entries when cache grows large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.created_at > CACHE_TTL_MS) cache.delete(k);
    }
  }
}

// ── Validation ──────────────────────────────────

const VALID_PERSPECTIVES = new Set<Perspective>(["panorama", "revenue", "trust", "behavior", "copy"]);
const VALID_STAGES = new Set<MaturityStage>(["launch", "growth", "scale"]);
const VALID_LOCALES = new Set<Locale>(["en", "pt-BR", "es", "de"]);

function validateBody(body: any): { valid: true; data: PulseSummaryRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  if (!VALID_PERSPECTIVES.has(body.perspective)) {
    return { valid: false, error: `Invalid perspective. Must be one of: ${[...VALID_PERSPECTIVES].join(", ")}` };
  }

  if (!Array.isArray(body.findings)) {
    return { valid: false, error: "findings must be an array" };
  }

  if (body.findings.length > 50) {
    return { valid: false, error: "Too many findings (max 50)" };
  }

  if (!Array.isArray(body.positive_checks)) {
    return { valid: false, error: "positive_checks must be an array" };
  }

  if (!body.cycle_delta || typeof body.cycle_delta !== "object") {
    return { valid: false, error: "cycle_delta is required" };
  }

  if (!VALID_STAGES.has(body.maturity_stage)) {
    return { valid: false, error: `Invalid maturity_stage. Must be one of: ${[...VALID_STAGES].join(", ")}` };
  }

  if (!VALID_LOCALES.has(body.locale)) {
    return { valid: false, error: `Invalid locale. Must be one of: ${[...VALID_LOCALES].join(", ")}` };
  }

  return { valid: true, data: body as PulseSummaryRequest };
}

// ── Prompt builders ─────────────────────────────

function buildSystemMessage(locale: Locale): string {
  return [
    "You are the Vestigio intelligence engine generating a workspace briefing.",
    "Be direct, specific, and commercially-focused.",
    "Frame everything in terms of revenue impact.",
    "Adapt tone to the business maturity stage.",
    `Respond in ${locale === "pt-BR" ? "Brazilian Portuguese" : locale === "es" ? "Spanish" : locale === "de" ? "German" : "English"}.`,
    "Output ONLY the briefing text — no headings, no bullet points, no markdown. 3-4 sentences max.",
  ].join(" ");
}

function buildUserMessage(data: PulseSummaryRequest): string {
  const parts: string[] = [];

  parts.push(`Perspective: ${data.perspective}`);
  parts.push(`Maturity stage: ${data.maturity_stage}`);

  if (data.findings.length > 0) {
    const findingLines = data.findings.slice(0, 10).map(
      (f) => `- ${f.title} (severity: ${f.severity}, impact: ${f.impact_estimate})`
    );
    parts.push(`Top findings:\n${findingLines.join("\n")}`);
  } else {
    parts.push("No negative findings this cycle.");
  }

  if (data.positive_checks.length > 0) {
    parts.push(`Positive checks: ${data.positive_checks.slice(0, 10).join(", ")}`);
  }

  const delta = data.cycle_delta;
  parts.push(
    `Cycle changes: ${delta.improved} improved, ${delta.worsened} worsened, ${delta.new} new`
  );

  parts.push(
    "Write a 3-4 sentence briefing as an analyst speaking directly to the business owner. " +
    "Be specific about dollar amounts when impact estimates are available. " +
    "Prioritize actionable insight over general observations."
  );

  return parts.join("\n\n");
}

// ── Route handler ───────────────────────────────

export async function POST(request: Request) {
  // ── Auth ──
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Invalid session" }, { status: 401 });
  }

  // ── Parse + validate ──
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const validation = validateBody(body);
  if (!validation.valid) {
    return NextResponse.json({ message: validation.error }, { status: 400 });
  }

  const data = validation.data;

  // ── Resolve environment for cache key ──
  let envId = data.environment_id || "default";
  try {
    const { prisma } = await import("@/libs/prismaDb");
    const membership = await prisma.membership.findFirst({
      where: { userId },
      include: {
        organization: {
          include: {
            environments: {
              where: data.environment_id
                ? { id: data.environment_id }
                : { isProduction: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!membership?.organization) {
      return NextResponse.json({ message: "No organization found" }, { status: 403 });
    }

    const env = membership.organization.environments[0];
    if (!env) {
      return NextResponse.json({ message: "No environment configured" }, { status: 404 });
    }

    if (data.environment_id && env.id !== data.environment_id) {
      return NextResponse.json({ message: "Environment not found in your organization" }, { status: 403 });
    }

    envId = env.id;
  } catch {
    // Dev fallback — continue with default envId
  }

  // ── Cache check ──
  const cycleRef = data.cycle_ref || "current";
  const cacheKey = `${envId}_${data.perspective}_${cycleRef}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ summary: cached });
  }

  // ── LLM availability check ──
  if (!isLlmEnabled()) {
    return NextResponse.json({ summary: null, fallback: true });
  }

  // ── Call Haiku ──
  try {
    const result = await callModel(
      "haiku_4_5",
      [{ role: "user", content: buildUserMessage(data) }],
      {
        max_tokens: 300,
        temperature: 0.4,
        system: buildSystemMessage(data.locale),
      },
    );

    // Extract text from content blocks
    const textBlock = result.content.find((b) => b.type === "text");
    const summary = textBlock && "text" in textBlock ? textBlock.text.trim() : null;

    if (!summary) {
      return NextResponse.json({ summary: null, fallback: true });
    }

    // Cache the result
    setCache(cacheKey, summary);

    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("[pulse-summary] Haiku call failed:", err?.message || err);
    return NextResponse.json({ summary: null, fallback: true });
  }
}
