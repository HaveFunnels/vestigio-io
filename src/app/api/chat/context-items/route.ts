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
// items the chat editor's context bar wants to display.
//
// **Why this exists:** entry points across the console (Discuss,
// Analyze together, Use as context) navigate to /app/chat with the
// selected items as URL params — but they pass IDs only. The chat
// page needs at minimum the title and the kind so the indicator
// above the editor can render something better than "1 item as
// context". This endpoint is the single batched lookup that powers
// that hydration.
//
// Body shape:
//   { items: [{ kind: "finding", id: "..." }, { kind: "action", id: "..." }] }
//
// Response shape:
//   { items: [{ kind, id, title, severity?, impact_mid?, pack? }] }
//
// Items that don't resolve are silently dropped — the client treats
// missing items as "context expired" rather than as an error.
//
// Server-side flow:
//   1. Auth + org/env resolution (mirrors /api/inventory)
//   2. ensureContext() bootstraps the in-memory MCP if cold
//   3. Pull all finding / action / workspace projections from MCP
//   4. Filter to the requested IDs and shape per-kind
// ──────────────────────────────────────────────

export const runtime = "nodejs";

type ContextKind = "finding" | "action" | "workspace" | "surface";

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
}

function normalizeKind(raw: string | undefined): ContextKind | null {
  if (!raw) return null;
  if (raw === "finding" || raw === "action" || raw === "workspace" || raw === "surface") {
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

    // Cap the input to keep this endpoint cheap. Anything beyond a
    // dozen items as inline context is almost certainly a misuse
    // (the LLM has its own retrieval tools for broader queries).
    const limited = requestedItems.slice(0, 50);

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
      // ensureContext failures are non-fatal — we just return empty.
      return NextResponse.json({ items: [] });
    }

    const server = getMcpServer();
    if (!server.getContext()) {
      return NextResponse.json({ items: [] });
    }

    // Pull projections once and index by id for O(1) lookup. We pull
    // all three even if the request only asks for one kind, because
    // the kind dispatch is cheap and avoids a per-request branch tree.
    const findingsById = new Map<string, any>();
    const actionsById = new Map<string, any>();
    const workspacesById = new Map<string, any>();

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

    const resolved: ContextItemResponse[] = [];
    for (const item of limited) {
      const kind = normalizeKind(item.kind);
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!kind || !id) continue;

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
      }
    }

    return NextResponse.json({ items: resolved });
  },
  { endpoint: "/api/chat/context-items", method: "POST" },
);
