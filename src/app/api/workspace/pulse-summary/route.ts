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

// Cache keyed by env+perspective+cycleId — valid until a new cycle completes.
// No TTL: the cycleRef in the key changes when a new audit finishes,
// which naturally invalidates stale entries. Max 1000 entries with LRU eviction.
const MAX_CACHE = 1000;
const cache = new Map<string, string>();

function getCached(key: string): string | null {
  return cache.get(key) ?? null;
}

function setCache(key: string, summary: string): void {
  cache.set(key, summary);
  if (cache.size > MAX_CACHE) {
    // Evict oldest (first inserted)
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

// ── Perspective classification ────────────────

function classifyFindingPerspective(pack: string): string {
  // Behavioral findings are emitted with pack="behavioral" today; the
  // older code took a separate `category` arg but Finding.category was
  // removed when we consolidated classification onto pack.
  if (pack === "behavioral") return "behavior";
  if (pack === "revenue_integrity" || pack === "chargeback_resilience") return "revenue";
  if (pack === "scale_readiness" || pack === "money_moment_exposure") return "trust";
  return "trust";
}

// ── Prompt builders ───────────────────────────

// Currency symbol per ISO 4217 code. The LLM gets the explicit symbol
// + format hint so it never falls back to "$" when the org is on BRL/
// EUR. Without this, pt-BR customers (havefunnels) saw all dollar
// amounts as "$" in an otherwise pt-BR briefing.
function currencyHint(currencyCode: string | null | undefined, locale: Locale): { symbol: string; instruction: string } {
  const code = (currencyCode || "").toUpperCase();
  const resolved = code || (locale === "pt-BR" ? "BRL" : locale === "es" ? "EUR" : locale === "de" ? "EUR" : "USD");
  const symbol = resolved === "BRL" ? "R$" : resolved === "EUR" ? "€" : resolved === "GBP" ? "£" : "$";
  return {
    symbol,
    instruction: `Use ${symbol} as the currency symbol for every monetary value. Format ${resolved === "BRL" ? "as R$ 1.234,56 (Brazilian format)" : resolved === "EUR" ? "as €1.234,56" : "as $1,234.56"}. Never substitute "$" when the symbol is ${symbol}.`,
  };
}

function buildSystemMessage(locale: Locale, currency: ReturnType<typeof currencyHint>): string {
  const lang = locale === "pt-BR" ? "Brazilian Portuguese" : locale === "es" ? "Spanish" : locale === "de" ? "German" : "English";
  return [
    "You are the Vestigio intelligence engine generating a workspace briefing.",
    "Be direct, specific, and commercially-focused.",
    // The briefing MUST stay on-topic for the workspace at hand. A
    // chargeback workspace briefing should read about chargeback risk
    // and dispute resilience; a revenue workspace about revenue leaks;
    // a trust workspace about trust posture; a copy workspace about
    // messaging and CTA effectiveness. NEVER reframe everything as
    // generic revenue impact — anchor language to the workspace's
    // domain so the reader knows which page they're on.
    "When a workspace name is provided, anchor every sentence to that workspace's domain (chargebacks talk about disputes/refunds, copy talks about messaging/CTAs, trust talks about checkout confidence, security talks about exposure, etc.). Cite monetary impact in that domain's terms, not as generic revenue.",
    `When monetary amounts are available, cite them specifically. ${currency.instruction}`,
    "Adapt tone to the business situation — urgent when there are critical issues, encouraging when things are improving.",
    `Respond in ${lang}.`,
    "Output ONLY the briefing text — no headings, no bullet points, no markdown.",
    "TARGET LENGTH: 3 complete sentences. Always finish your final sentence.",
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
  workspaceName?: string | null;
  currencySymbol: string;
}): string {
  const parts: string[] = [];
  const sym = context.currencySymbol;

  if (context.workspaceName) {
    parts.push(
      `Workspace: ${context.workspaceName} (${perspective} perspective).`,
      `IMPORTANT: This briefing is for the "${context.workspaceName}" workspace specifically — center every sentence on that workspace's topic. Do NOT widen the framing to org-wide revenue unless the findings explicitly call for it.`,
    );
  } else {
    parts.push(`Perspective: ${perspective}`);
  }
  parts.push(`Domain: ${context.domain}`);

  if (context.businessProfile) {
    const bp = context.businessProfile;
    if (bp.businessModel) parts.push(`Business model: ${bp.businessModel}`);
    if (bp.monthlyRevenue) parts.push(`Monthly revenue: ${sym}${bp.monthlyRevenue.toLocaleString()}`);
  }

  parts.push(`Total monthly exposure: ${sym}${Math.round(context.totalExposure).toLocaleString()}`);

  const negativeFindings = context.findings.filter(f => f.polarity === "negative");
  if (negativeFindings.length > 0) {
    const lines = negativeFindings.slice(0, 12).map(f => {
      const impact = f.impact_mid > 0 ? ` (${sym}${Math.round(f.impact_mid).toLocaleString()}/mo)` : "";
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
    "Write a 3-sentence briefing as an analyst speaking directly to the business owner. " +
    "Be specific about dollar amounts. Prioritize actionable insight over general observations. " +
    "Always complete your final sentence."
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
  // Optional workspace scope — narrows the briefing to a specific
  // workspace's findings. The client passes the workspace's name (for
  // prompt context) and the finding IDs it already has projected.
  const workspaceName: string | null =
    typeof body.workspaceName === "string" && body.workspaceName.trim().length > 0
      ? body.workspaceName.trim().slice(0, 120)
      : null;
  const workspaceFindingIds: string[] | null =
    Array.isArray(body.findingIds) && body.findingIds.every((x: unknown) => typeof x === "string")
      ? (body.findingIds as string[]).slice(0, 200)
      : null;

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
  // Workspace-scoped cache uses workspaceName + finding-ID-set hash so
  // briefings stay distinct between sibling workspaces in the same cycle.
  const wsScope = workspaceName && workspaceFindingIds
    ? `ws:${workspaceName}:${workspaceFindingIds.slice().sort().join(",").slice(0, 200)}`
    : perspective;
  // Locale MUST be part of the key — a previous pt-BR briefing was being
  // served to en-US requesters (and vice versa) because the cache was
  // env+scope+cycle-only. Same finding set, different language → distinct
  // cache entries.
  const cacheKey = `${env.id}_${wsScope}_${cycleRef}_${locale}`;
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

  // ── Filter by scope ──
  // Workspace scope (when client passes findingIds) takes precedence over
  // perspective scope so workspace pages get a briefing scoped to just
  // their own findings rather than the whole perspective.
  // Finding rows carry the scalar columns directly; the rich projection
  // (title, impact breakdown, reasoning, …) lives serialised in `projection`.
  // Parse on demand — failing gracefully to the scalar columns if the JSON
  // is missing or malformed (shouldn't happen, but LLM output should never
  // crash the dashboard).
  let perspectiveFindings;
  if (workspaceFindingIds && workspaceFindingIds.length > 0) {
    const wantedIds = new Set(workspaceFindingIds);
    perspectiveFindings = findings.filter(f => wantedIds.has(f.id));
  } else if (perspective === "panorama") {
    perspectiveFindings = findings;
  } else {
    perspectiveFindings = findings.filter(f => classifyFindingPerspective(f.pack || "") === perspective);
  }

  // ── Build context ──
  let totalExposure = 0;
  let improved = 0, worsened = 0, newIssues = 0, resolved = 0, positiveChecks = 0;

  const mappedFindings = perspectiveFindings.map(f => {
    let proj: { title?: string; severity?: string } = {};
    try {
      if (f.projection) proj = JSON.parse(f.projection) as typeof proj;
    } catch {
      // fall through to column fallbacks
    }

    const impactMid = f.impactMidpoint || 0;
    const polarity = f.polarity || "negative";
    const changeClass = f.changeClass || null;

    if (polarity === "negative") totalExposure += impactMid;
    if (polarity === "positive") positiveChecks++;
    if (changeClass === "improvement") improved++;
    if (changeClass === "regression") worsened++;
    if (changeClass === "new_issue") newIssues++;
    if (changeClass === "resolved") resolved++;

    return {
      title: proj.title || "Untitled",
      severity: proj.severity || f.severity || "medium",
      pack: f.pack || "",
      impact_mid: impactMid,
      change_class: changeClass,
      polarity,
    };
  });

  // ── Call Haiku ──
  // Wave 18g — resolve currency from org's preferred code (set during
  // onboarding or auto-derived from locale). Passes to both the system
  // prompt (so the LLM never substitutes "$") and the user prompt
  // (so every cited amount uses the same symbol).
  const orgCurrencyCode =
    (membership.organization as unknown as { currencyCode?: string | null }).currencyCode ??
    (membership.organization as unknown as { currency?: string | null }).currency ??
    null;
  const currency = currencyHint(orgCurrencyCode, locale);
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
        workspaceName,
        currencySymbol: currency.symbol,
      }) }],
      {
        max_tokens: 300,
        temperature: 0.4,
        system: buildSystemMessage(locale, currency),
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
