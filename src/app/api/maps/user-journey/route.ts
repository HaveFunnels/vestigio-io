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
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
    if (orgCtx.orgId === "demo") {
      return NextResponse.json({ map: buildDemoJourneyMap() });
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

    const journeyPages = [...commercialPages]
      .sort((a, b) => (stageOrder[a.pageType?.toLowerCase() || ""] ?? 99) - (stageOrder[b.pageType?.toLowerCase() || ""] ?? 99));

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
        mode: "inferred",
        pageCount: pages.length,
        relationCount: relations.length,
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

function buildDemoJourneyMap(): MapDefinition & { metadata: Record<string, unknown> } {
  const NODE_SPACING_X = 280;
  const COMMERCIAL_Y = 200;
  const SUPPORT_Y = COMMERCIAL_Y + 240;

  const commercial: Array<{
    id: string;
    pageType: string;
    label: string;
    path: string;
  }> = [
    { id: "home", pageType: "homepage", label: "Homepage", path: "/" },
    { id: "product", pageType: "product", label: "Product Detail", path: "/products/sample" },
    { id: "pricing", pageType: "pricing", label: "Pricing", path: "/pricing" },
    { id: "cart", pageType: "cart", label: "Cart", path: "/cart" },
    { id: "checkout", pageType: "checkout", label: "Checkout", path: "/checkout" },
    { id: "confirmation", pageType: "thank_you", label: "Confirmation", path: "/thank-you" },
  ];

  const support: Array<{ id: string; pageType: string; label: string; path: string }> = [
    { id: "help", pageType: "support", label: "Help Center", path: "/help" },
    { id: "refunds", pageType: "policy", label: "Refund Policy", path: "/policies/refunds" },
  ];

  const nodes: MapNode[] = [];

  commercial.forEach((p, idx) => {
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
        stage: idx,
      },
      position: { x: idx * NODE_SPACING_X, y: COMMERCIAL_Y },
    });
  });

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
  for (let i = 0; i < commercial.length - 1; i++) {
    edges.push({
      id: `demo_edge_${i}`,
      source: `demo_${commercial[i].id}`,
      target: `demo_${commercial[i + 1].id}`,
      type: "transition",
      label: null,
    });
  }
  // One redirect link to exercise the new edge type (e.g. pricing → cart).
  edges.push({
    id: "demo_edge_redirect",
    source: "demo_pricing",
    target: "demo_checkout",
    type: "redirect",
    label: null,
  });

  return {
    id: "user_journey",
    name: "User Journey",
    type: "user_journey",
    nodes,
    edges,
    legend: {
      nodes: [
        { labelKey: "journey_homepage", swatch: "journey_homepage" },
        { labelKey: "journey_product", swatch: "journey_product" },
        { labelKey: "journey_pricing", swatch: "journey_pricing" },
        { labelKey: "journey_cart", swatch: "journey_cart" },
        { labelKey: "journey_checkout", swatch: "journey_checkout" },
        { labelKey: "journey_confirmation", swatch: "journey_confirmation" },
        { labelKey: "journey_support", swatch: "journey_support" },
      ],
      edges: [
        { labelKey: "transition", swatch: "transition" },
        { labelKey: "redirect", swatch: "redirect" },
      ],
    },
    metadata: {
      mode: "demo",
      pageCount: commercial.length + support.length,
      relationCount: edges.length,
    },
  };
}
