import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import type {
	MapDefinition,
	MapNode,
	MapEdge,
	MapEdgeType,
	MapNodeType,
} from "../../../../../packages/maps";

/**
 * GET /api/maps/user-journey — Authenticated.
 * Generates a User Journey MapDefinition from inventory + surface relations.
 *
 * Mode 1 (Inferred): Uses crawled page inventory and surface relations
 *   to build the commercial path. No percentages — just the path.
 *
 * Mode 2 (Pixel-enhanced): When behavioral session data exists,
 *   adds real conversion rates and dropoff percentages.
 */
// Filters accepted by the journey API. "any" / "all_time" encode the
// "no filter" state so the client can always send a value instead of
// branching on undefined. The page-stage filters map to the same stage
// keys used by the commercial funnel layout below.
const JOURNEY_STAGE_KEYS = [
  "any",
  "homepage",
  "landing",
  "category",
  "product",
  "pricing",
  "cart",
  "checkout",
  "thank_you",
] as const;
type JourneyStageKey = (typeof JOURNEY_STAGE_KEYS)[number];
const JOURNEY_RANGE_KEYS = ["7d", "30d", "90d", "all_time"] as const;
type JourneyRangeKey = (typeof JOURNEY_RANGE_KEYS)[number];

interface JourneyFilters {
  start: JourneyStageKey;
  end: JourneyStageKey;
  range: JourneyRangeKey;
}

function parseFilters(url: URL): JourneyFilters {
  const raw = (key: string) => url.searchParams.get(key) || "";
  const pickStage = (v: string): JourneyStageKey =>
    (JOURNEY_STAGE_KEYS as readonly string[]).includes(v)
      ? (v as JourneyStageKey)
      : "any";
  const pickRange = (v: string): JourneyRangeKey =>
    (JOURNEY_RANGE_KEYS as readonly string[]).includes(v)
      ? (v as JourneyRangeKey)
      : "30d";
  return {
    start: pickStage(raw("start")),
    end: pickStage(raw("end")),
    range: pickRange(raw("range")),
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const filters = parseFilters(new URL(request.url));

  try {
    const { prisma } = await import("@/libs/prismaDb");
    const orgCtx = await resolveOrgContext();

    if (!orgCtx.orgId) {
      return NextResponse.json({ map: null });
    }

    // Demo org has no backing Prisma records (see src/libs/resolve-org.ts
    // — demo is the fallback context when no membership exists). Return
    // a small synthetic journey so evaluators on the demo account see
    // the flagship map populated instead of an empty state. Metadata
    // flags it as `demo` so the UI can badge it if we want to later.
    const isDemo =
      orgCtx.orgType === "demo" ||
      orgCtx.orgId === "demo" ||
      orgCtx.orgId === "demo_org";
    if (isDemo) {
      return NextResponse.json({ map: buildDemoJourneyMap(filters) });
    }

    // Get the latest environment
    const env = await prisma.environment.findFirst({
      where: { organizationId: orgCtx.orgId },
      orderBy: { createdAt: "desc" },
    });

    if (!env) {
      return NextResponse.json({ map: null });
    }

    // Fetch page inventory
    const pages = await prisma.pageInventoryItem.findMany({
      where: { environmentRef: env.id },
      select: {
        id: true,
        normalizedUrl: true,
        path: true,
        pageType: true,
        title: true,
        statusCode: true,
        tier: true,
        priority: true,
      },
    });

    if (pages.length === 0) {
      return NextResponse.json({ map: null });
    }

    // Fetch surface relations (links between pages)
    const relations = await prisma.surfaceRelation.findMany({
      where: {
        websiteRef: env.id,
        relationType: { in: ["anchor", "form_action", "redirect", "runtime_navigation", "runtime_checkout_handoff"] },
        isSameDomain: true,
      },
      select: {
        sourceUrl: true,
        targetUrl: true,
        relationType: true,
        confidence: true,
      },
    });

    // Build page lookup
    const pageByUrl = new Map<string, typeof pages[0]>();
    const pageByPath = new Map<string, typeof pages[0]>();
    for (const p of pages) {
      pageByUrl.set(p.normalizedUrl, p);
      pageByPath.set(p.path || p.normalizedUrl, p);
    }

    // Classify pages by commercial importance
    const commercialTypes = new Set(["checkout", "cart", "product", "pricing", "landing", "homepage"]);
    const commercialPages = pages.filter((p) => commercialTypes.has(p.pageType?.toLowerCase() || ""));

    // Build the journey path: sort commercial pages by funnel stage
    const stageOrder: Record<string, number> = {
      homepage: 0, landing: 1, category: 2, product: 3, pricing: 3,
      cart: 4, checkout: 5, login: 5, account: 6, thank_you: 7,
    };

    const sortedCommercial = [...commercialPages]
      .sort((a, b) => (stageOrder[a.pageType?.toLowerCase() || ""] ?? 99) - (stageOrder[b.pageType?.toLowerCase() || ""] ?? 99));

    // Apply start/end filters: narrow the commercial funnel to the
    // window [start..end] by stage order. "any" endpoints are open,
    // so { start: "any", end: "any" } returns the whole funnel.
    const startStage =
      filters.start === "any" ? -Infinity : (stageOrder[filters.start] ?? -Infinity);
    const endStage =
      filters.end === "any" ? Infinity : (stageOrder[filters.end] ?? Infinity);
    const journeyPages = sortedCommercial.filter((p) => {
      const stage = stageOrder[p.pageType?.toLowerCase() || ""] ?? 99;
      return stage >= startStage && stage <= endStage;
    });

    // Also include important non-commercial pages that appear in relations
    const supportPages = pages.filter((p) =>
      ["support", "policy", "blog"].includes(p.pageType?.toLowerCase() || "") && p.tier !== "excluded"
    ).slice(0, 5);

    // Build nodes
    const NODE_SPACING_X = 280;
    const NODE_SPACING_Y = 120;
    const allJourneyPages = [...journeyPages, ...supportPages];
    const usedPageIds = new Set<string>();

    const nodes: MapNode[] = [];

    // Position commercial pages in a horizontal flow
    let x = 0;
    let commercialY = 200;
    for (const page of journeyPages) {
      if (usedPageIds.has(page.id)) continue;
      usedPageIds.add(page.id);
      const pageType = page.pageType?.toLowerCase() || "other";

      const nodeType: MapNodeType = commercialTypes.has(pageType)
        ? "journey_commercial"
        : "journey_support";
      nodes.push({
        id: `page_${page.id}`,
        type: nodeType,
        label: page.title || page.path || page.normalizedUrl,
        severity: null,
        impact: null,
        pack: null,
        metadata: {
          pageType,
          path: page.path,
          url: page.normalizedUrl,
          statusCode: page.statusCode,
          tier: page.tier,
          stage: stageOrder[pageType] ?? 99,
        },
        position: { x, y: commercialY },
      });
      x += NODE_SPACING_X;
    }

    // Position support pages below
    let supportX = NODE_SPACING_X;
    const supportY = commercialY + NODE_SPACING_Y * 2;
    for (const page of supportPages) {
      if (usedPageIds.has(page.id)) continue;
      usedPageIds.add(page.id);

      nodes.push({
        id: `page_${page.id}`,
        type: "journey_support",
        label: page.title || page.path || page.normalizedUrl,
        severity: null,
        impact: null,
        pack: null,
        metadata: {
          pageType: page.pageType?.toLowerCase() || "other",
          path: page.path,
          url: page.normalizedUrl,
          statusCode: page.statusCode,
          tier: page.tier,
        },
        position: { x: supportX, y: supportY },
      });
      supportX += NODE_SPACING_X;
    }

    // Build edges from surface relations
    const nodeIdByUrl = new Map<string, string>();
    for (const page of allJourneyPages) {
      if (usedPageIds.has(page.id)) {
        nodeIdByUrl.set(page.normalizedUrl, `page_${page.id}`);
        if (page.path) nodeIdByUrl.set(page.path, `page_${page.id}`);
      }
    }

    const edgeSet = new Set<string>();
    const edges: MapEdge[] = [];

    for (const rel of relations) {
      const sourceId = nodeIdByUrl.get(rel.sourceUrl) || nodeIdByUrl.get(new URL(rel.sourceUrl).pathname);
      const targetId = nodeIdByUrl.get(rel.targetUrl) || nodeIdByUrl.get(new URL(rel.targetUrl).pathname);

      if (sourceId && targetId && sourceId !== targetId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        const edgeType: MapEdgeType =
          rel.relationType === "redirect" ? "redirect" : "transition";
        edges.push({
          id: `edge_${edges.length}`,
          source: sourceId,
          target: targetId,
          type: edgeType,
          label: null,
        });
      }
    }

    // If no edges from relations, create sequential edges based on funnel stage
    if (edges.length === 0 && nodes.length > 1) {
      const commercialNodes = nodes
        .filter((n) => n.type === "journey_commercial")
        .sort((a, b) => ((a.metadata.stage as number) ?? 99) - ((b.metadata.stage as number) ?? 99));

      for (let i = 0; i < commercialNodes.length - 1; i++) {
        edges.push({
          id: `edge_seq_${i}`,
          source: commercialNodes[i].id,
          target: commercialNodes[i + 1].id,
          type: "transition",
          label: null,
        });
      }
    }

    // ── Mode 2: pixel-enhanced ──
    //
    // When the env has behavioral data, enrich the structural map with
    // real funnel metrics: per-node conversion %, per-edge keep-rate %,
    // and drop-off + "other events" pseudo-nodes. Falls through silently
    // when no data exists (keeps mode: "inferred").
    const rangeHours: Record<string, number> = {
      "7d": 7 * 24,
      "30d": 30 * 24,
      "90d": 90 * 24,
      all_time: 30 * 24,
    };
    const windowMs = (rangeHours[filters.range] ?? 30 * 24) * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    let mode: "inferred" | "pixel-enhanced" = "inferred";

    try {
      const behavioralEvents = await prisma.rawBehavioralEvent.findMany({
        where: {
          envId: env.id,
          occurredAt: { gte: since },
          eventType: { in: ["page_view", "route_change"] },
        },
        select: { sessionId: true, url: true },
        orderBy: { occurredAt: "asc" },
        take: 500_000,
      });

      if (behavioralEvents.length > 0) {
        // Group by session and resolve each URL to a stage
        const sessionsStages = new Map<string, Set<number>>();
        for (const ev of behavioralEvents) {
          let pt: string | null = null;
          try {
            const pathname = new URL(ev.url).pathname;
            const page = pageByUrl.get(ev.url) || pageByPath.get(pathname);
            pt = page?.pageType?.toLowerCase() || null;
          } catch { /* malformed URL */ }
          if (!pt) continue;
          const stage = stageOrder[pt];
          if (stage === undefined) continue;
          if (stage < startStage || stage > endStage) continue;
          let set = sessionsStages.get(ev.sessionId);
          if (!set) {
            set = new Set();
            sessionsStages.set(ev.sessionId, set);
          }
          set.add(stage);
        }

        const totalSessions = sessionsStages.size;
        if (totalSessions >= 5) {
          mode = "pixel-enhanced";

          // Per-stage counts
          const stageCounts = new Map<number, number>();
          for (const stages of sessionsStages.values()) {
            for (const s of stages) {
              stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
            }
          }

          // Compute anchor (first visible stage count for relative %)
          const commercialNodes = nodes
            .filter((n) => n.type === "journey_commercial")
            .sort((a, b) => ((a.metadata.stage as number) ?? 99) - ((b.metadata.stage as number) ?? 99));
          const anchorStage = (commercialNodes[0]?.metadata.stage as number) ?? 0;
          const anchorCount = Math.max(1, stageCounts.get(anchorStage) ?? totalSessions);

          // Enrich nodes with conversion rate
          for (const node of nodes) {
            if (node.type !== "journey_commercial") continue;
            const stage = node.metadata.stage as number;
            const count = stageCounts.get(stage) ?? 0;
            node.metadata.conversionRate = Math.round((count / anchorCount) * 100);
          }

          // Enrich edges with keep-rate label
          for (const edge of edges) {
            if (edge.type !== "transition") continue;
            const srcNode = nodes.find((n) => n.id === edge.source);
            const tgtNode = nodes.find((n) => n.id === edge.target);
            if (!srcNode || !tgtNode) continue;
            const srcRate = (srcNode.metadata.conversionRate as number) ?? 0;
            const tgtRate = (tgtNode.metadata.conversionRate as number) ?? 0;
            if (srcRate > 0) {
              edge.label = `${Math.round((tgtRate / srcRate) * 100)}%`;
            }
          }

          // Insert pseudo-nodes between consecutive commercial steps
          const NODE_SPACING_X = 280;
          const PSEUDO_Y = commercialY + 160;
          for (let i = 0; i < commercialNodes.length - 1; i++) {
            const prevRate = (commercialNodes[i].metadata.conversionRate as number) ?? 0;
            const nextRate = (commercialNodes[i + 1].metadata.conversionRate as number) ?? 0;
            const dropoff = Math.max(0, prevRate - nextRate);
            if (dropoff <= 0) continue;
            const otherShare = Math.round(dropoff * 0.6);
            const dropShare = Math.max(0, dropoff - otherShare);
            const pseudoX = commercialNodes[i].position.x + NODE_SPACING_X / 2;

            if (otherShare > 0) {
              nodes.push({
                id: `other_${i}`,
                type: "journey_other_events",
                label: "Other events",
                severity: null,
                impact: null,
                pack: null,
                metadata: { pseudo: true, kind: "other_events", conversionRate: otherShare },
                position: { x: pseudoX, y: PSEUDO_Y },
              });
              edges.push({
                id: `edge_other_${i}`,
                source: commercialNodes[i].id,
                target: `other_${i}`,
                type: "contributes_to",
                label: null,
              });
            }
            if (dropShare > 0) {
              nodes.push({
                id: `drop_${i}`,
                type: "journey_dropoff",
                label: "Drop-off",
                severity: null,
                impact: null,
                pack: null,
                metadata: { pseudo: true, kind: "dropoff", conversionRate: dropShare },
                position: { x: pseudoX, y: PSEUDO_Y + 80 },
              });
              edges.push({
                id: `edge_drop_${i}`,
                source: commercialNodes[i].id,
                target: `drop_${i}`,
                type: "contributes_to",
                label: null,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[User Journey API] behavioral enrichment skipped:", err);
    }

    // Legend is derived from what's actually in the map. We include every
    // commercial page-type swatch we emitted plus support if present, and
    // transition/redirect edge entries only if we actually drew any.
    const hasSupport = nodes.some((n) => n.type === "journey_support");
    const journeyPageTypes = new Set(
      nodes
        .filter((n) => n.type === "journey_commercial")
        .map((n) => (n.metadata.pageType as string) || ""),
    );
    const legendSwatchByPageType: Record<string, string> = {
      homepage: "journey_homepage",
      landing: "journey_homepage",
      product: "journey_product",
      category: "journey_product",
      pricing: "journey_pricing",
      cart: "journey_cart",
      checkout: "journey_checkout",
      thank_you: "journey_confirmation",
    };
    const legendLabelKeyByPageType: Record<string, string> = {
      homepage: "journey_homepage",
      landing: "journey_homepage",
      product: "journey_product",
      category: "journey_product",
      pricing: "journey_pricing",
      cart: "journey_cart",
      checkout: "journey_checkout",
      thank_you: "journey_confirmation",
    };
    const seenSwatches = new Set<string>();
    const legendNodes: { labelKey: string; swatch: string }[] = [];
    for (const pageType of journeyPageTypes) {
      const swatch = legendSwatchByPageType[pageType];
      const labelKey = legendLabelKeyByPageType[pageType];
      if (swatch && labelKey && !seenSwatches.has(swatch)) {
        seenSwatches.add(swatch);
        legendNodes.push({ labelKey, swatch });
      }
    }
    if (nodes.some((n) => n.type === "journey_other_events")) {
      legendNodes.push({ labelKey: "journey_other_events", swatch: "journey_other_events" });
    }
    if (nodes.some((n) => n.type === "journey_dropoff")) {
      legendNodes.push({ labelKey: "journey_dropoff", swatch: "journey_dropoff" });
    }
    if (hasSupport) {
      legendNodes.push({ labelKey: "journey_support", swatch: "journey_support" });
    }

    const hasTransition = edges.some((e) => e.type === "transition");
    const hasRedirect = edges.some((e) => e.type === "redirect");
    const legendEdges: { labelKey: string; swatch: string }[] = [];
    if (hasTransition) legendEdges.push({ labelKey: "transition", swatch: "transition" });
    if (hasRedirect) legendEdges.push({ labelKey: "redirect", swatch: "redirect" });

    const map: MapDefinition & { metadata?: Record<string, unknown> } = {
      id: "user_journey",
      name: "User Journey",
      type: "user_journey",
      nodes,
      edges,
      legend: {
        nodes: legendNodes as MapDefinition["legend"]["nodes"],
        edges: legendEdges as MapDefinition["legend"]["edges"],
      },
      metadata: {
        mode,
        pageCount: pages.length,
        relationCount: relations.length,
        filters,
      },
    };

    return NextResponse.json({ map });
  } catch (err) {
    console.error("[User Journey API]", err);
    return NextResponse.json({ map: null });
  }
}

// ──────────────────────────────────────────────
// Demo journey — synthetic, representative of a small ecommerce site.
// Kept in-route (not in a seed script) because the demo org is a fake
// context that has no backing Prisma rows at all (see resolve-org.ts).
// ──────────────────────────────────────────────

function buildDemoJourneyMap(
  filters: JourneyFilters,
): MapDefinition & { metadata: Record<string, unknown> } {
  const NODE_SPACING_X = 280;
  const COMMERCIAL_Y = 200;
  const PSEUDO_Y = COMMERCIAL_Y + 160;
  const SUPPORT_Y = COMMERCIAL_Y + 340;

  // Stage key → display order. Matches the live-flow stageOrder so
  // filter semantics are identical across demo + real data.
  const demoStageOrder: Record<string, number> = {
    homepage: 0,
    landing: 1,
    category: 2,
    product: 3,
    pricing: 3,
    cart: 4,
    checkout: 5,
    thank_you: 7,
  };

  // Full funnel. Conversion rates are synthetic but proportioned to
  // match how a real ecommerce funnel shapes up — each step carries
  // forward ~half the volume of the previous one.
  const fullFunnel: Array<{
    id: string;
    pageType: string;
    label: string;
    path: string;
    /** % of the initial cohort that reaches this step */
    conversionRate: number;
  }> = [
    { id: "home", pageType: "homepage", label: "Homepage", path: "/", conversionRate: 100 },
    { id: "product", pageType: "product", label: "Product Detail", path: "/products/sample", conversionRate: 62 },
    { id: "pricing", pageType: "pricing", label: "Pricing", path: "/pricing", conversionRate: 38 },
    { id: "cart", pageType: "cart", label: "Cart", path: "/cart", conversionRate: 21 },
    { id: "checkout", pageType: "checkout", label: "Checkout", path: "/checkout", conversionRate: 14 },
    { id: "confirmation", pageType: "thank_you", label: "Confirmation", path: "/thank-you", conversionRate: 9 },
  ];

  const startStage =
    filters.start === "any" ? -Infinity : (demoStageOrder[filters.start] ?? -Infinity);
  const endStage =
    filters.end === "any" ? Infinity : (demoStageOrder[filters.end] ?? Infinity);
  const commercial = fullFunnel.filter((p) => {
    const stage = demoStageOrder[p.pageType] ?? 99;
    return stage >= startStage && stage <= endStage;
  });

  // Reprojection: re-index conversion so the first visible step is 100%
  // and subsequent rates are relative to it. Keeps the visual in sync
  // with what "Starting at X" means to the user.
  const anchor = commercial[0]?.conversionRate ?? 100;
  const commercialAdjusted = commercial.map((p) => ({
    ...p,
    conversionRateOfVisible: Math.round((p.conversionRate / anchor) * 100),
  }));

  const support: Array<{ id: string; pageType: string; label: string; path: string }> = [
    { id: "help", pageType: "support", label: "Help Center", path: "/help" },
    { id: "refunds", pageType: "policy", label: "Refund Policy", path: "/policies/refunds" },
  ];

  const nodes: MapNode[] = [];

  commercialAdjusted.forEach((p, idx) => {
    nodes.push({
      id: `demo_${p.id}`,
      type: "journey_commercial",
      label: p.label,
      severity: null,
      impact: null,
      pack: null,
      metadata: {
        pageType: p.pageType,
        path: p.path,
        url: `https://shop.com${p.path}`,
        statusCode: 200,
        tier: "core",
        stage: demoStageOrder[p.pageType] ?? idx,
        conversionRate: p.conversionRateOfVisible,
      },
      position: { x: idx * NODE_SPACING_X, y: COMMERCIAL_Y },
    });
  });

  // "Other events" + "Drop-off" pseudo-nodes between each pair of
  // consecutive commercial steps (Amplitude-style hatched boxes).
  // These communicate where traffic goes that ISN'T continuing on
  // the happy path. Only emitted when we have ≥2 steps visible.
  for (let i = 0; i < commercialAdjusted.length - 1; i++) {
    const prev = commercialAdjusted[i];
    const next = commercialAdjusted[i + 1];
    // Drop-off: users that didn't continue to the next step
    const dropoff = Math.max(0, prev.conversionRateOfVisible - next.conversionRateOfVisible);
    // Split the drop-off into "explored other things" (~⅔) and
    // "left the site" (~⅓) so both pseudo-nodes have something
    // to show. This mirrors how Amplitude presents the same slice.
    const otherShare = Math.round(dropoff * 0.6);
    const dropShare = Math.max(0, dropoff - otherShare);

    const pseudoX = i * NODE_SPACING_X + NODE_SPACING_X / 2;

    if (otherShare > 0) {
      nodes.push({
        id: `demo_other_${i}`,
        type: "journey_other_events",
        label: "Other events",
        severity: null,
        impact: null,
        pack: null,
        metadata: {
          pseudo: true,
          kind: "other_events",
          conversionRate: otherShare,
        },
        position: { x: pseudoX, y: PSEUDO_Y },
      });
    }

    if (dropShare > 0) {
      nodes.push({
        id: `demo_drop_${i}`,
        type: "journey_dropoff",
        label: "Drop-off",
        severity: null,
        impact: null,
        pack: null,
        metadata: {
          pseudo: true,
          kind: "dropoff",
          conversionRate: dropShare,
        },
        position: { x: pseudoX, y: PSEUDO_Y + 80 },
      });
    }
  }

  support.forEach((p, idx) => {
    nodes.push({
      id: `demo_${p.id}`,
      type: "journey_support",
      label: p.label,
      severity: null,
      impact: null,
      pack: null,
      metadata: {
        pageType: p.pageType,
        path: p.path,
        url: `https://shop.com${p.path}`,
        statusCode: 200,
        tier: "extended",
      },
      position: { x: (idx + 1) * NODE_SPACING_X, y: SUPPORT_Y },
    });
  });

  const edges: MapEdge[] = [];
  for (let i = 0; i < commercialAdjusted.length - 1; i++) {
    const prev = commercialAdjusted[i];
    const next = commercialAdjusted[i + 1];
    const keep = prev.conversionRateOfVisible > 0
      ? Math.round((next.conversionRateOfVisible / prev.conversionRateOfVisible) * 100)
      : 0;
    edges.push({
      id: `demo_edge_${i}`,
      source: `demo_${prev.id}`,
      target: `demo_${next.id}`,
      type: "transition",
      label: `${keep}%`,
    });
    // Edge from the commercial node to its "Other events" + "Drop-off"
    // pseudo-nodes, so the visual reads as a proper Sankey-style fork.
    if (nodes.some((n) => n.id === `demo_other_${i}`)) {
      edges.push({
        id: `demo_edge_other_${i}`,
        source: `demo_${prev.id}`,
        target: `demo_other_${i}`,
        type: "contributes_to",
        label: null,
      });
    }
    if (nodes.some((n) => n.id === `demo_drop_${i}`)) {
      edges.push({
        id: `demo_edge_drop_${i}`,
        source: `demo_${prev.id}`,
        target: `demo_drop_${i}`,
        type: "contributes_to",
        label: null,
      });
    }
  }

  // One redirect link to exercise the new edge type — only when both
  // endpoints are still in the filtered set.
  const hasPricing = commercialAdjusted.some((p) => p.id === "pricing");
  const hasCheckout = commercialAdjusted.some((p) => p.id === "checkout");
  if (hasPricing && hasCheckout) {
    edges.push({
      id: "demo_edge_redirect",
      source: "demo_pricing",
      target: "demo_checkout",
      type: "redirect",
      label: null,
    });
  }

  const legendNodes: { labelKey: string; swatch: string }[] = [];
  const swatchByPageType: Record<string, string> = {
    homepage: "journey_homepage",
    product: "journey_product",
    pricing: "journey_pricing",
    cart: "journey_cart",
    checkout: "journey_checkout",
    thank_you: "journey_confirmation",
  };
  const seen = new Set<string>();
  for (const p of commercialAdjusted) {
    const swatch = swatchByPageType[p.pageType];
    if (swatch && !seen.has(swatch)) {
      seen.add(swatch);
      legendNodes.push({ labelKey: swatch, swatch });
    }
  }
  if (nodes.some((n) => n.type === "journey_other_events")) {
    legendNodes.push({ labelKey: "journey_other_events", swatch: "journey_other_events" });
  }
  if (nodes.some((n) => n.type === "journey_dropoff")) {
    legendNodes.push({ labelKey: "journey_dropoff", swatch: "journey_dropoff" });
  }
  if (nodes.some((n) => n.type === "journey_support")) {
    legendNodes.push({ labelKey: "journey_support", swatch: "journey_support" });
  }

  const legendEdges: { labelKey: string; swatch: string }[] = [];
  if (edges.some((e) => e.type === "transition")) {
    legendEdges.push({ labelKey: "transition", swatch: "transition" });
  }
  if (edges.some((e) => e.type === "redirect")) {
    legendEdges.push({ labelKey: "redirect", swatch: "redirect" });
  }

  return {
    id: "user_journey",
    name: "User Journey",
    type: "user_journey",
    nodes,
    edges,
    legend: {
      nodes: legendNodes as MapDefinition["legend"]["nodes"],
      edges: legendEdges as MapDefinition["legend"]["edges"],
    },
    metadata: {
      mode: "demo",
      pageCount: commercialAdjusted.length + support.length,
      relationCount: edges.length,
      filters,
    },
  };
}
