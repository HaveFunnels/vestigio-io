import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { ensureContext } from "@/lib/console-data";
import { getMcpServer } from "@/lib/mcp-client";
import { loadEngineTranslations } from "@/lib/engine-translations";

// ──────────────────────────────────────────────
// Chat Context Items — POST /api/chat/context-items
//
// Hydrates the metadata (title, severity, impact, etc.) for the
// items that need to be displayed with proper labels in the chat
// surface. Two consumers today:
//
//   1. **Chat editor context bar** — entry points across the console
//      (Discuss, Analyze together, Use as context) navigate to
//      /app/chat with the selected items as URL params, but they
//      pass IDs only. This endpoint resolves the IDs into titles +
//      severity + impact so the indicator above the editor can show
//      a real chip instead of "1 item as context".
//
//   2. **Legacy message hydration on restore** — assistant messages
//      persisted before the server-side block resolver shipped
//      have raw `$$FINDING{id}$$` / `$$ACTION{id}$$` / `$$KB{...}$$`
//      markers in their `content` column. When the chat page
//      restores such a message it parses the markers into
//      placeholder cards (no title, no impact, no slug) and then
//      calls THIS endpoint to fetch the real metadata for every
//      placeholder, so legacy messages render with proper styling
//      AND proper data instead of generic "Finding abc123" labels.
//      That's why the endpoint also resolves `kb_finding` and
//      `kb_root_cause` — those exist purely for the on-restore
//      hydration path.
//
// Body shape:
//   { items: [
//       { kind: "finding", id: "..." },
//       { kind: "action", id: "..." },
//       { kind: "workspace", id: "..." },
//       { kind: "surface", id: "..." },
//       { kind: "kb_finding", id: "<inference_key>" },
//       { kind: "kb_root_cause", id: "<root_cause_key>" },
//   ] }
//
// Response shape:
//   { items: [{
//       kind, id, title,
//       severity?, impact_mid?, pack?,   // findings + actions
//       slug?, excerpt?,                  // kb_*
//   }] }
//
// Items that don't resolve are silently dropped — the client treats
// missing items as "context expired" rather than as an error and
// renders the placeholder card unchanged.
//
// Server-side flow:
//   1. Auth + org/env resolution (mirrors /api/inventory)
//   2. ensureContext() bootstraps the in-memory MCP if cold
//   3. Pull all finding / action / workspace projections from MCP
//      ONCE (only if any matching kinds were requested — saves work
//      when the request is purely KB hydration)
//   4. Fetch any requested KB articles via Sanity in parallel (the
//      same helpers the chat route's $$KB{...}$$ resolver uses)
//   5. Walk the requested items, dispatch by kind, return resolved
// ──────────────────────────────────────────────

export const runtime = "nodejs";

type ContextKind =
  | "finding"
  | "action"
  | "workspace"
  | "surface"
  | "kb_finding"
  | "kb_root_cause";

interface ContextItemRequest {
  items?: Array<{ kind?: string; id?: string }>;
}

interface ContextItemResponse {
  kind: ContextKind;
  id: string;
  title: string;
  severity?: string;
  impact_mid?: number;
  pack?: string;
  /** Sanity slug — only set for kb_* kinds */
  slug?: string;
  /** Sanity excerpt — only set for kb_* kinds */
  excerpt?: string | null;
}

function normalizeKind(raw: string | undefined): ContextKind | null {
  if (!raw) return null;
  if (
    raw === "finding" ||
    raw === "action" ||
    raw === "workspace" ||
    raw === "surface" ||
    raw === "kb_finding" ||
    raw === "kb_root_cause"
  ) {
    return raw;
  }
  return null;
}

export const POST = withErrorTracking(
  async function POST(request: Request) {
    const user = await isAuthorized();
    if (!user) {
      return NextResponse.json({ items: [] }, { status: 401 });
    }

    let body: ContextItemRequest;
    try {
      body = (await request.json()) as ContextItemRequest;
    } catch {
      return NextResponse.json(
        { items: [], message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (requestedItems.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // Cap the input to keep this endpoint cheap. Legacy chat hydration
    // can need a bigger ceiling than the editor context bar (a long
    // assistant message can carry many finding/action references), so
    // 100 is the right level: high enough that no realistic message
    // gets truncated, low enough that an abusive payload still has
    // bounded server cost.
    const limited = requestedItems.slice(0, 100);

    // Resolve user → org → environment (same shape as /api/inventory)
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { organizationId: true },
    });
    if (!membership) {
      return NextResponse.json({ items: [] });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      return NextResponse.json({ items: [] });
    }

    const environment = await prisma.environment.findFirst({
      where: { organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!environment) {
      return NextResponse.json({ items: [] });
    }

    const website = await prisma.website.findFirst({
      where: { environmentRef: environment.id },
      select: { id: true, domain: true },
    });
    if (!website) {
      return NextResponse.json({ items: [] });
    }

    // Validate + bucket the requested items per kind ONCE. This lets
    // us short-circuit MCP bootstrap when the request is purely KB
    // hydration (legacy chat restore scenario where the messages
    // referenced findings the engine no longer knows about, but the
    // KB articles for them still exist in Sanity).
    const requestedFindingIds = new Set<string>();
    const requestedActionIds = new Set<string>();
    const requestedWorkspaceIds = new Set<string>();
    const requestedSurfaceIds = new Set<string>();
    const requestedKbFindingKeys = new Set<string>();
    const requestedKbRootCauseKeys = new Set<string>();
    const inputOrder: Array<{ kind: ContextKind; id: string }> = [];
    for (const item of limited) {
      const kind = normalizeKind(item.kind);
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!kind || !id) continue;
      inputOrder.push({ kind, id });
      if (kind === "finding") requestedFindingIds.add(id);
      else if (kind === "action") requestedActionIds.add(id);
      else if (kind === "workspace") requestedWorkspaceIds.add(id);
      else if (kind === "surface") requestedSurfaceIds.add(id);
      else if (kind === "kb_finding") requestedKbFindingKeys.add(id);
      else if (kind === "kb_root_cause") requestedKbRootCauseKeys.add(id);
    }

    const needsMcp =
      requestedFindingIds.size > 0 ||
      requestedActionIds.size > 0 ||
      requestedWorkspaceIds.size > 0;
    const needsKb =
      requestedKbFindingKeys.size > 0 || requestedKbRootCauseKeys.size > 0;

    // Pull projections once and index by id for O(1) lookup. Skipped
    // entirely when the request is purely KB hydration.
    const findingsById = new Map<string, any>();
    const actionsById = new Map<string, any>();
    const workspacesById = new Map<string, any>();

    if (needsMcp) {
      // Bootstrap MCP context (no-op if already loaded)
      try {
        const translations = await loadEngineTranslations();
        await ensureContext({
          orgId: organization.id,
          orgName: organization.name,
          envId: environment.id,
          domain: website.domain,
          engineTranslations: translations,
        });
      } catch {
        // ensureContext failures are non-fatal — MCP-backed lookups
        // just return nothing for those items, KB lookups still work.
      }

      const server = getMcpServer();
      if (server.getContext()) {
        try {
          const findingsResult = server.callTool("get_finding_projections");
          if (findingsResult.type === "finding_projections" && Array.isArray(findingsResult.data)) {
            for (const f of findingsResult.data) {
              findingsById.set(f.id, f);
            }
          }
        } catch { /* missing → finding lookups will silently return nothing */ }

        try {
          const actionsResult = server.callTool("get_action_projections");
          if (actionsResult.type === "action_projections" && Array.isArray(actionsResult.data)) {
            for (const a of actionsResult.data) {
              actionsById.set(a.id, a);
            }
          }
        } catch { /* same as above */ }

        try {
          const workspacesResult = server.callTool("get_workspace_projections");
          if (workspacesResult.type === "workspace_projections" && Array.isArray(workspacesResult.data)) {
            for (const w of workspacesResult.data) {
              workspacesById.set(w.id, w);
            }
          }
        } catch { /* same */ }
      }
    }

    // Fetch KB articles in parallel via the same Sanity helpers the
    // chat route uses for $$KB{...}$$ marker resolution. Articles
    // that aren't published yet just resolve to undefined and the
    // item gets dropped from the response.
    const kbFindingByKey = new Map<string, { title: string; slug: string; excerpt: string | null }>();
    const kbRootCauseByKey = new Map<string, { title: string; slug: string; excerpt: string | null }>();

    if (needsKb) {
      try {
        const { getKnowledgeArticleByFindingKey, getKnowledgeArticleByRootCauseKey } = await import("@/sanity/sanity-utils");

        const findingPromises = Array.from(requestedKbFindingKeys).map(async (key) => {
          try {
            const article = await getKnowledgeArticleByFindingKey(key, "en");
            if (article) {
              kbFindingByKey.set(key, {
                title: article.title,
                slug: article.slug.current,
                excerpt: article.excerpt ?? null,
              });
            }
          } catch { /* missing — drop */ }
        });

        const rootCausePromises = Array.from(requestedKbRootCauseKeys).map(async (key) => {
          try {
            const article = await getKnowledgeArticleByRootCauseKey(key);
            if (article) {
              kbRootCauseByKey.set(key, {
                title: article.title,
                slug: article.slug.current,
                excerpt: article.excerpt ?? null,
              });
            }
          } catch { /* missing — drop */ }
        });

        await Promise.all([...findingPromises, ...rootCausePromises]);
      } catch { /* Sanity unavailable — KB items will be dropped */ }
    }

    // Walk the request in input order and dispatch by kind. Items
    // that don't resolve are silently skipped — the client treats
    // the absence as "this card stays as a placeholder, no harm done".
    const resolved: ContextItemResponse[] = [];
    for (const { kind, id } of inputOrder) {
      if (kind === "finding") {
        const f = findingsById.get(id);
        if (!f) continue;
        resolved.push({
          kind: "finding",
          id: f.id,
          title: f.title,
          severity: f.severity,
          impact_mid: f.impact?.midpoint || 0,
          pack: f.pack,
        });
      } else if (kind === "action") {
        const a = actionsById.get(id);
        if (!a) continue;
        resolved.push({
          kind: "action",
          id: a.id,
          title: a.title,
          severity: a.severity,
          impact_mid: a.impact?.midpoint || 0,
        });
      } else if (kind === "workspace") {
        const w = workspacesById.get(id);
        if (!w) continue;
        resolved.push({
          kind: "workspace",
          id: w.id,
          title: w.name,
          impact_mid: w.summary?.total_loss_mid || 0,
        });
      } else if (kind === "surface") {
        // Surfaces don't currently have a projection — render the path
        // itself as the title. This is enough for the indicator chip;
        // the LLM resolves them via its own tools when asked.
        resolved.push({
          kind: "surface",
          id,
          title: id,
        });
      } else if (kind === "kb_finding") {
        const article = kbFindingByKey.get(id);
        if (!article) continue;
        resolved.push({
          kind: "kb_finding",
          id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
        });
      } else if (kind === "kb_root_cause") {
        const article = kbRootCauseByKey.get(id);
        if (!article) continue;
        resolved.push({
          kind: "kb_root_cause",
          id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
        });
      }
    }

    return NextResponse.json({ items: resolved });
  },
  { endpoint: "/api/chat/context-items", method: "POST" },
);
