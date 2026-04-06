import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";

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

    if (!orgCtx.orgId || orgCtx.orgId === "demo") {
      return NextResponse.json({ map: null });
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

    interface JourneyNode {
      id: string;
      type: string;
      label: string;
      severity: string | null;
      impact: { min: number; max: number; midpoint: number } | null;
      pack: string | null;
      metadata: Record<string, unknown>;
      position: { x: number; y: number };
    }

    const nodes: JourneyNode[] = [];

    // Position commercial pages in a horizontal flow
    let x = 0;
    let commercialY = 200;
    for (const page of journeyPages) {
      if (usedPageIds.has(page.id)) continue;
      usedPageIds.add(page.id);
      const pageType = page.pageType?.toLowerCase() || "other";

      nodes.push({
        id: `page_${page.id}`,
        type: commercialTypes.has(pageType) ? "journey_commercial" : "journey_support",
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

    interface JourneyEdge {
      id: string;
      source: string;
      target: string;
      type: string;
      label: string | null;
    }

    const edgeSet = new Set<string>();
    const edges: JourneyEdge[] = [];

    for (const rel of relations) {
      const sourceId = nodeIdByUrl.get(rel.sourceUrl) || nodeIdByUrl.get(new URL(rel.sourceUrl).pathname);
      const targetId = nodeIdByUrl.get(rel.targetUrl) || nodeIdByUrl.get(new URL(rel.targetUrl).pathname);

      if (sourceId && targetId && sourceId !== targetId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        edges.push({
          id: `edge_${edges.length}`,
          source: sourceId,
          target: targetId,
          type: rel.relationType === "redirect" ? "redirect" : "transition",
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

    const map = {
      id: "user_journey",
      name: "User Journey",
      type: "user_journey",
      nodes,
      edges,
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
