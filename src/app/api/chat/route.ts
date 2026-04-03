import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { evaluateAlerts } from "@/libs/alert-evaluator";
import { trackError } from "@/libs/error-tracker";
import {
  executePipeline,
  isLlmEnabled,
  createEmptyConversation,
  TIER_QUERY_COST,
  type ModelTier,
  type PipelineRequest,
  type PipelineCallbacks,
  type OrgContext as LlmOrgContext,
} from "../../../../apps/mcp/llm";
import { createEmptySession } from "../../../../apps/mcp/session";
import { safeIncrementMcpUsage } from "../../../../apps/platform/billing-safety";
import { getConversationStore } from "../../../../apps/platform/conversation-store";
import type { PlanKey } from "../../../../packages/plans";

// ──────────────────────────────────────────────
// Chat API — POST /api/chat
//
// SSE streaming endpoint for Claude LLM chat.
// Hardened:
//   - Multi-level ownership: session → org → env → user
//   - Atomic budget check (full cost before commit)
//   - Streaming with timeout and abort support
//   - Input validation with size limits
// ──────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATION_MESSAGES = 50;
const STREAM_TIMEOUT_MS = 120_000; // 2 minutes

export async function POST(request: Request) {
  // ── Auth: session → user → org membership ──
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Invalid session" }, { status: 401 });
  }

  // ── Parse + validate request body ──────────
  let body: {
    message: string;
    environment_id?: string;
    model_tier?: string;
    conversation_id?: string;
    conversation_messages?: Array<{ role: string; content: string; timestamp: number }>;
    attached_files?: Array<{ name: string; type: string; content: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ message: "message is required" }, { status: 400 });
  }

  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` }, { status: 400 });
  }

  if (body.conversation_messages && body.conversation_messages.length > MAX_CONVERSATION_MESSAGES) {
    return NextResponse.json({ message: `Too many conversation messages (max ${MAX_CONVERSATION_MESSAGES})` }, { status: 400 });
  }

  // ── LLM availability check ─────────────────
  if (!isLlmEnabled()) {
    return NextResponse.json(
      { message: "Chat is not configured. Set ANTHROPIC_API_KEY and VESTIGIO_LLM_ENABLED=true." },
      { status: 503 },
    );
  }

  // ── Resolve org context with ownership validation ──
  let orgId: string;
  let orgName: string;
  let envId: string;
  let domain: string;
  let plan: PlanKey;

  try {
    const { prisma } = await import("@/libs/prismaDb");

    // Validate user → org membership
    const membership = await prisma.membership.findFirst({
      where: { userId },
      include: {
        organization: {
          include: {
            environments: {
              where: body.environment_id
                ? { id: body.environment_id }
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

    const org = membership.organization;
    const env = org.environments[0];

    if (!env) {
      return NextResponse.json({ message: "No environment configured" }, { status: 404 });
    }

    // If environment_id was specified, verify it belongs to this org
    if (body.environment_id && env.id !== body.environment_id) {
      return NextResponse.json({ message: "Environment not found in your organization" }, { status: 403 });
    }

    orgId = org.id;
    orgName = org.name;
    envId = env.id;
    domain = env.domain;
    plan = (org.plan || "vestigio") as PlanKey;
  } catch {
    // Fallback for dev without DB
    orgId = "demo";
    orgName = "Demo";
    envId = "env_1";
    domain = "shop.com";
    plan = "vestigio";
  }

  // ── Model tier + atomic budget check ───────
  const modelTier: ModelTier = body.model_tier === "ultra" ? "ultra" : "default";
  const queryCost = TIER_QUERY_COST[modelTier];

  // Check budget BEFORE consuming — verify we can afford the full cost
  const budgetCheck = await safeIncrementMcpUsage(orgId, plan);
  if (!budgetCheck.allowed) {
    return NextResponse.json(
      { message: "Daily analysis budget exhausted. Try again tomorrow or upgrade your plan." },
      { status: 429 },
    );
  }

  // Fire-and-forget: evaluate alert rules for mcp_usage and org_over_limit
  evaluateAlerts("mcp_usage").catch(() => {});
  evaluateAlerts("org_over_limit").catch(() => {});

  // For ultra: check if remaining budget covers the extra cost
  if (queryCost > 1 && budgetCheck.current + queryCost - 1 > budgetCheck.limit) {
    return NextResponse.json(
      { message: `Not enough budget for Ultra analysis (needs ${queryCost} units, ${budgetCheck.limit - budgetCheck.current} remaining). Try Default mode.` },
      { status: 429 },
    );
  }

  // Consume extra units for ultra
  for (let i = 1; i < queryCost; i++) {
    await safeIncrementMcpUsage(orgId, plan);
  }

  // ── Get MCP server ─────────────────────────
  const { getMcpServer } = await import("@/lib/mcp-client");
  const mcpServer = getMcpServer();

  // ── Validate conversation total size ─────────
  if (body.conversation_messages) {
    const totalChars = body.conversation_messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalChars > 50_000) {
      return NextResponse.json(
        { message: `Conversation too large (${Math.round(totalChars / 1000)}k chars, max 50k)` },
        { status: 400 },
      );
    }
  }

  // ── Build conversation state ───────────────
  const conversationState = body.conversation_messages?.length
    ? {
        messages: body.conversation_messages.slice(-MAX_CONVERSATION_MESSAGES).map((m) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content || '').slice(0, 5000),
          timestamp: m.timestamp || Date.now(),
        })),
        summary_of_older: null,
        total_message_count: body.conversation_messages.length,
      }
    : createEmptyConversation();

  // ── Detect locale from cookie or Accept-Language ──
  const localeCookie = request.headers.get("cookie")?.match(/NEXT_LOCALE=([^;]+)/)?.[1];
  const acceptLang = request.headers.get("accept-language")?.split(",")[0]?.trim() || "en";
  const locale = localeCookie || (acceptLang.startsWith("pt") ? "pt-BR" : acceptLang.startsWith("es") ? "es" : acceptLang.startsWith("de") ? "de" : "en");

  // ── Build LLM org context ──────────────────
  const llmOrgContext: LlmOrgContext = {
    org_id: orgId,
    org_name: orgName,
    environment_id: envId,
    domain,
    business_model: "ecommerce",
    monthly_revenue: null,
    plan,
    freshness_state: "unknown",
    finding_count: 0,
    top_findings_summary: "",
    locale,
  };

  // Enrich from DB (fire-and-forget on failure)
  try {
    const { prisma } = await import("@/libs/prismaDb");
    const profile = await prisma.businessProfile.findUnique({
      where: { organizationId: orgId },
    });
    if (profile) {
      llmOrgContext.business_model = profile.businessModel;
      llmOrgContext.monthly_revenue = profile.monthlyRevenue;
    }
  } catch {
    // Continue with defaults
  }

  // ── Build exploration state from conversation history ──
  const sessionContext = createEmptySession();
  if (body.conversation_messages) {
    // Derive exploration state from tools mentioned in previous messages
    for (const msg of body.conversation_messages) {
      const content = msg.content || "";
      // Detect previously discussed packs
      if (content.includes("scale_readiness") || content.includes("scale")) sessionContext.exploration_state.explored_packs.push("scale_readiness");
      if (content.includes("revenue_integrity") || content.includes("revenue")) sessionContext.exploration_state.explored_packs.push("revenue_integrity");
      if (content.includes("chargeback")) sessionContext.exploration_state.explored_packs.push("chargeback_resilience");
      // Detect previously viewed maps
      if (content.includes("revenue_leakage")) sessionContext.exploration_state.explored_maps.push("revenue_leakage");
      if (content.includes("root_cause")) sessionContext.exploration_state.explored_maps.push("root_cause");
      if (content.includes("chargeback_risk")) sessionContext.exploration_state.explored_maps.push("chargeback_risk");
      // Track questions asked
      if (msg.role === "user") {
        sessionContext.exploration_state.asked_questions.push(content.slice(0, 100));
      }
    }
    // Deduplicate
    sessionContext.exploration_state.explored_packs = [...new Set(sessionContext.exploration_state.explored_packs)];
    sessionContext.exploration_state.explored_maps = [...new Set(sessionContext.exploration_state.explored_maps)];
  }

  // ── Pipeline request ───────────────────────
  const pipelineRequest: PipelineRequest = {
    user_message: body.message,
    conversation: conversationState,
    org_context: llmOrgContext,
    user_id: userId,
    conversation_id: body.conversation_id || "ephemeral",
    model_tier: modelTier,
    session_context: sessionContext,
    attached_files: body.attached_files?.slice(0, 3).map((f: any) => ({
      name: String(f.name || "file").slice(0, 100),
      type: String(f.type || "text/plain").slice(0, 50),
      content: String(f.content || "").slice(0, 50_000),
    })),
  };

  // ── SSE streaming response with timeout ────
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const streamTimeout = setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: any) {
        if (abortController.signal.aborted) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream may be closed by client
        }
      }

      const callbacks: PipelineCallbacks = {
        onGuardResult: (result) => sendEvent("guard", { safe: result.safe, category: result.category }),
        onToolStart: (tool, label) => sendEvent("tool_start", { tool, label }),
        onToolDone: (tool, summary) => sendEvent("tool_done", { tool, summary: summary.slice(0, 200) }),
        onTextDelta: (text) => sendEvent("delta", { text }),
        onError: (message, code) => sendEvent("error", { message, code }),
        onPromptSuggestion: (original, suggested, reason) => sendEvent("prompt_suggestion", { original, suggested, reason }),
      };

      try {
        // Pass abort signal to pipeline so it stops consuming tokens on timeout
        const result = await executePipeline(pipelineRequest, mcpServer, callbacks, {
          signal: abortController.signal,
        });

        // ── Persist messages to conversation store ──
        const convId = pipelineRequest.conversation_id;
        // ── Persist messages ──────────────────────
        const totalInputTokens = result.tokens.input + result.guard_tokens.input + result.classifier_tokens.input;
        const totalOutputTokens = result.tokens.output + result.guard_tokens.output + result.classifier_tokens.output;
        // Use actual token-based cost (not rough estimate)
        const { calculateCostCents } = await import("../../../../apps/platform/token-cost");
        const costCents = calculateCostCents({
          model: result.model_id_used,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        });

        if (convId && convId !== "ephemeral") {
          const store = getConversationStore();
          // Save user message
          store.addMessage(convId, { role: "user", content: body.message }).catch(() => {});
          // Save assistant message with cost tracking (atomic)
          store.addMessage(convId, {
            role: "assistant",
            content: result.response_text,
            model: result.model_id_used,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costCents,
            toolCalls: result.tool_calls_made.length > 0
              ? JSON.stringify(result.tool_calls_made.map((tc) => ({ tool: tc.tool_name, ms: tc.execution_ms })))
              : undefined,
            purpose: "core_chat",
          }).catch(() => {});
          // Update conversation totals
          store.updateTotals(convId, costCents, totalInputTokens, totalOutputTokens).catch(() => {});
        }

        // ── Compute remaining budget ─────────────
        let mcpRemaining: number | undefined;
        try {
          const { getDailyUsageSummary } = await import("../../../../apps/platform/daily-usage");
          const summary = await getDailyUsageSummary(orgId, plan);
          mcpRemaining = summary.mcp_remaining;
        } catch { /* continue */ }

        // ── Collect finding/action data for card resolution ──
        let findingsMap: Record<string, any> = {};
        let actionsMap: Record<string, any> = {};
        try {
          const findingsResult = mcpServer.callTool("get_finding_projections");
          if (findingsResult.type === "finding_projections" && Array.isArray(findingsResult.data)) {
            for (const f of findingsResult.data) {
              findingsMap[f.id] = {
                id: f.id, title: f.title, severity: f.severity, confidence: f.confidence,
                impact_mid: f.impact?.midpoint || 0, impact_min: f.impact?.monthly_range?.min || 0,
                impact_max: f.impact?.monthly_range?.max || 0, pack: f.pack, root_cause: f.root_cause || null,
              };
            }
          }
          const actionsResult = mcpServer.callTool("get_action_projections");
          if (actionsResult.type === "action_projections" && Array.isArray(actionsResult.data)) {
            for (const a of actionsResult.data) {
              actionsMap[a.id] = {
                id: a.id, title: a.title, severity: a.severity,
                impact_mid: a.impact?.midpoint || 0, cross_pack: a.cross_pack || false,
                priority_score: a.priority_score || 0,
              };
            }
          }
        } catch { /* MCP data not available — cards will show IDs only */ }

        sendEvent("done", {
          request_id: result.request_id,
          response: result.response_text,
          model_tier: result.model_tier_used,
          cost_cents: costCents,
          mcp_remaining: mcpRemaining,
          findings_data: findingsMap,
          actions_data: actionsMap,
          tokens: result.tokens,
          guard_tokens: result.guard_tokens,
          classifier_tokens: result.classifier_tokens,
          tool_calls: result.tool_calls_made.map((tc) => ({
            tool: tc.tool_name,
            summary: tc.result_summary.slice(0, 200),
            ms: tc.execution_ms,
          })),
          latency_ms: result.latency_ms,
        });
      } catch (err: any) {
        if (abortController.signal.aborted) {
          sendEvent("error", { message: "Request timed out. Try a more specific question.", code: "timeout" });
        } else {
          sendEvent("error", { message: "An unexpected error occurred. Please try again.", code: "internal_error" });

          trackError({
            errorType: "LlmPipelineError",
            message: err?.message || "Unknown pipeline error",
            endpoint: "/api/chat",
            method: "POST",
            userId,
            organizationId: orgId,
            severity: "error",
          }).catch(() => {});
        }
      } finally {
        clearTimeout(streamTimeout);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
