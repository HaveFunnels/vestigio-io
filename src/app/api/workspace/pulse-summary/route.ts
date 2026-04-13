import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { isLlmEnabled, callModel } from "../../../../../apps/mcp/llm/client";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Pulse Summary API — POST /api/workspace/pulse-summary
//
// Generates a concise LLM briefing for a workspace
// perspective. Loads ALL context server-side from the
// DB (same data the MCP chat sees) so the briefing
// is as rich as a chat response.
//
// The frontend only sends: { perspective, locale }
// Everything else is loaded from the latest findings.
// ──────────────────────────────────────────────

type Perspective = "panorama" | "revenue" | "trust" | "behavior" | "copy";
type Locale = "en" | "pt-BR" | "es" | "de";

const VALID_PERSPECTIVES = new Set<Perspective>(["panorama", "revenue", "trust", "behavior", "copy"]);
const VALID_LOCALES = new Set<Locale>(["en", "pt-BR", "es", "de"]);

// ── In-memory cache (1h TTL) ──────────────────

const CACHE_TTL_MS = 60 * 60 * 1000;
interface CacheEntry { summary: string; created_at: number }
const cache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.created_at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.summary;
}

function setCache(key: string, summary: string): void {
  cache.set(key, { summary, created_at: Date.now() });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.created_at > CACHE_TTL_MS) cache.delete(k); }
  }
}

// ── Perspective classification ────────────────

function classifyFindingPerspective(packKey: string, category: string): string {
  if (category === "behavioral") return "behavior";
  if (packKey === "revenue_integrity" || packKey === "chargeback_resilience") return "revenue";
  if (packKey === "scale_readiness" || packKey === "money_moment_exposure") return "trust";
  return "trust";
}

// ── Prompt builders ───────────────────────────

function buildSystemMessage(locale: Locale): string {
  const lang = locale === "pt-BR" ? "Brazilian Portuguese" : locale === "es" ? "Spanish" : locale === "de" ? "German" : "English";
  return [
    "You are the Vestigio intelligence engine generating a workspace briefing.",
    "Be direct, specific, and commercially-focused.",
    "Frame everything in terms of revenue impact.",
    "When dollar/currency amounts are available, cite them specifically.",
    "Adapt tone to the business situation — urgent when there are critical issues, encouraging when things are improving.",
    `Respond in ${lang}.`,
    "Output ONLY the briefing text — no headings, no bullet points, no markdown.",
    "STRICT LENGTH: 2-3 sentences, maximum 280 characters. Be concise like a telegram.",
  ].join(" ");
}

function buildUserMessage(perspective: string, context: {
  findings: { title: string; severity: string; pack: string; impact_mid: number; change_class: string | null; polarity: string }[];
  businessProfile: { businessModel: string | null; monthlyRevenue: number | null } | null;
  domain: string;
  totalExposure: number;
  improved: number;
  worsened: number;
  newIssues: number;
  resolved: number;
  positiveChecks: number;
}): string {
  const parts: string[] = [];

  parts.push(`Perspective: ${perspective}`);
  parts.push(`Domain: ${context.domain}`);

  if (context.businessProfile) {
    const bp = context.businessProfile;
    if (bp.businessModel) parts.push(`Business model: ${bp.businessModel}`);
    if (bp.monthlyRevenue) parts.push(`Monthly revenue: $${bp.monthlyRevenue.toLocaleString()}`);
  }

  parts.push(`Total monthly exposure: $${Math.round(context.totalExposure).toLocaleString()}`);

  const negativeFindings = context.findings.filter(f => f.polarity === "negative");
  if (negativeFindings.length > 0) {
    const lines = negativeFindings.slice(0, 12).map(f => {
      const impact = f.impact_mid > 0 ? ` ($${Math.round(f.impact_mid).toLocaleString()}/mo)` : "";
      const change = f.change_class ? ` [${f.change_class}]` : "";
      return `- ${f.title} (${f.severity})${impact}${change}`;
    });
    parts.push(`Findings (${negativeFindings.length} issues):\n${lines.join("\n")}`);
  } else {
    parts.push("No negative findings this cycle.");
  }

  if (context.positiveChecks > 0) {
    parts.push(`Positive checks passing: ${context.positiveChecks}`);
  }

  const delta = [];
  if (context.worsened > 0) delta.push(`${context.worsened} worsened`);
  if (context.newIssues > 0) delta.push(`${context.newIssues} new`);
  if (context.improved > 0) delta.push(`${context.improved} improved`);
  if (context.resolved > 0) delta.push(`${context.resolved} resolved`);
  if (delta.length > 0) parts.push(`Changes since last cycle: ${delta.join(", ")}`);

  parts.push(
    "Write a 3-4 sentence briefing as an analyst speaking directly to the business owner. " +
    "Be specific about dollar amounts. Prioritize actionable insight over general observations."
  );

  return parts.join("\n\n");
}

// ── Route handler ─────────────────────────────

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Invalid session" }, { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const perspective: Perspective = VALID_PERSPECTIVES.has(body.perspective) ? body.perspective : "panorama";
  const locale: Locale = VALID_LOCALES.has(body.locale) ? body.locale : "pt-BR";

  // ── Resolve environment from user's org ──
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: {
      organization: {
        include: {
          environments: { take: 1 },
          businessProfile: true,
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
    return NextResponse.json({ summary: null, fallback: true });
  }

  // ── Cache check ──
  const latestCycle = await prisma.auditCycle.findFirst({
    where: { environmentId: env.id, status: "complete" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });

  const cycleRef = latestCycle?.id || "none";
  const cacheKey = `${env.id}_${perspective}_${cycleRef}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ summary: cached });
  }

  // ── LLM check ──
  if (!isLlmEnabled()) {
    return NextResponse.json({ summary: null, fallback: true });
  }

  // ── Load findings from DB ──
  const findings = await prisma.finding.findMany({
    where: { environmentId: env.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (findings.length === 0) {
    return NextResponse.json({ summary: null, fallback: true });
  }

  // ── Filter by perspective ──
  const perspectiveFindings = perspective === "panorama"
    ? findings
    : findings.filter(f => {
        const p = classifyFindingPerspective(f.packKey || "", f.category || "core");
        return p === perspective;
      });

  // ── Build context ──
  let totalExposure = 0;
  let improved = 0, worsened = 0, newIssues = 0, resolved = 0, positiveChecks = 0;

  const mappedFindings = perspectiveFindings.map(f => {
    const data = f.data as any || {};
    const impactMid = data.impact?.midpoint || 0;
    const polarity = data.polarity || "negative";
    const changeClass = data.change_class || null;

    if (polarity === "negative") totalExposure += impactMid;
    if (polarity === "positive") positiveChecks++;
    if (changeClass === "improvement") improved++;
    if (changeClass === "regression") worsened++;
    if (changeClass === "new_issue") newIssues++;
    if (changeClass === "resolved") resolved++;

    return {
      title: f.title || data.title || "Untitled",
      severity: data.severity || "medium",
      pack: f.packKey || "",
      impact_mid: impactMid,
      change_class: changeClass,
      polarity,
    };
  });

  // ── Call Haiku ──
  try {
    const result = await callModel(
      "haiku_4_5",
      [{ role: "user", content: buildUserMessage(perspective, {
        findings: mappedFindings,
        businessProfile: membership.organization.businessProfile,
        domain: env.domain,
        totalExposure,
        improved,
        worsened,
        newIssues,
        resolved,
        positiveChecks,
      }) }],
      {
        max_tokens: 150,
        temperature: 0.4,
        system: buildSystemMessage(locale),
      },
    );

    const textBlock = result.content.find((b) => b.type === "text");
    const summary = textBlock && "text" in textBlock ? textBlock.text.trim() : null;

    if (!summary) {
      return NextResponse.json({ summary: null, fallback: true });
    }

    setCache(cacheKey, summary);
    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("[pulse-summary] Haiku call failed:", err?.message || err);
    return NextResponse.json({ summary: null, fallback: true });
  }
}
