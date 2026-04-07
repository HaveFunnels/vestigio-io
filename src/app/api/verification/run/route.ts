import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { ensureContext } from "@/lib/console-data";
import { getMcpServer } from "@/lib/mcp-client";
import { loadEngineTranslations } from "@/lib/engine-translations";

// ──────────────────────────────────────────────
// Verification Run — Wave 0.6
//
// Closes the loop between the Actions drawer's "Re-verify" / "Confirm
// Resolution" CTAs and the MCP verification orchestrator. Until this
// route existed the buttons were toast-only stubs.
//
// Body: { action_id: string, intent?: 're_verify' | 'confirm_resolution' }
// Auth: requires authenticated user with org membership.
//
// Flow:
//   1. Resolve user → org → environment (mirrors /api/inventory)
//   2. ensureContext() bootstraps the MCP singleton if cold-started
//   3. Look up the GlobalAction by action_key in the engine context
//   4. Derive verification_type / subject_ref / decision_ref
//   5. mcpServer.verify() — runs the orchestrator and recomputes
//   6. Re-fetch the action projection so the client gets fresh maturity
//
// Notes:
//   - Browser verification can take ~30s; we set maxDuration accordingly.
//   - The verification policy may downgrade the requested type — that's
//     surfaced as a "skipped" response, not an error.
//   - The result lives in the in-memory MCP singleton; on a server
//     restart it would be lost. Persisting verifications across
//     restarts is a separate Wave-0.x concern.
// ──────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 60;

interface RunVerificationBody {
  action_id?: string;
  intent?: "re_verify" | "confirm_resolution";
}

export const POST = withErrorTracking(
  async function POST(request: Request) {
    const user = await isAuthorized();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    let body: RunVerificationBody;
    try {
      body = (await request.json()) as RunVerificationBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const actionId = body.action_id?.trim();
    if (!actionId) {
      return NextResponse.json(
        { ok: false, message: "action_id is required" },
        { status: 400 },
      );
    }
    const intent = body.intent === "confirm_resolution" ? "confirm_resolution" : "re_verify";

    // Resolve user → org → environment (same shape as /api/inventory)
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { organizationId: true },
    });
    if (!membership) {
      return NextResponse.json(
        { ok: false, message: "No organization found" },
        { status: 404 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      return NextResponse.json(
        { ok: false, message: "Organization not found" },
        { status: 404 },
      );
    }

    const environment = await prisma.environment.findFirst({
      where: { organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!environment) {
      return NextResponse.json(
        { ok: false, message: "No environment found" },
        { status: 404 },
      );
    }

    const website = await prisma.website.findFirst({
      where: { environmentRef: environment.id },
      select: { id: true, domain: true },
    });
    if (!website) {
      return NextResponse.json(
        { ok: false, message: "No website yet — first audit hasn't completed" },
        { status: 409 },
      );
    }

    // Bootstrap MCP context (no-op if already loaded for this process)
    const translations = await loadEngineTranslations();
    await ensureContext({
      orgId: organization.id,
      orgName: organization.name,
      envId: environment.id,
      domain: website.domain,
      engineTranslations: translations,
    });

    const server = getMcpServer();
    const ctx = server.getContext();
    if (!ctx) {
      return NextResponse.json(
        {
          ok: false,
          code: "no_context",
          message: "No analysis context loaded. Run an audit first.",
        },
        { status: 409 },
      );
    }

    // Find the GlobalAction by action_key (this is what ActionProjection.id holds)
    const action = ctx.result.intelligence.global_actions.find(
      (a: { action_key: string }) => a.action_key === actionId,
    );
    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          code: "action_not_found",
          message: "Action no longer exists in current context. Reload the page and try again.",
        },
        { status: 404 },
      );
    }

    // Decision ref — first source decision is fine; the engine uses it to
    // attribute the verification result and the policy uses it for cost.
    const decisionRef: string | undefined = action.source_decisions?.[0];

    // Subject ref — fall back to website ref. Most action verifications
    // probe the live site, so this is the right default. Surface-specific
    // path scoping is handled by the orchestrator's path_scope from loadContext.
    const subjectRef = `website:${website.domain}`;

    // Reason — human-friendly so the verification request is auditable.
    const reasonPrefix =
      intent === "confirm_resolution"
        ? "Confirming post-resolution status for"
        : "Manual re-verification requested for";
    const reason = `${reasonPrefix}: ${action.title}`;

    // Verification type — request browser_verification (the strongest
    // probe). The global verification policy will downgrade it if budget
    // / value-cost dictates, and we'll relay the policy decision back to
    // the client so the UI can explain it.
    const requestedType = "browser_verification";

    let verifyResult;
    try {
      verifyResult = await server.verify({
        verification_type: requestedType,
        subject_ref: subjectRef,
        reason,
        decision_ref: decisionRef,
        requested_by: "manual",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown verification error";
      console.error("[api/verification/run] verify() threw:", err);
      return NextResponse.json(
        { ok: false, code: "verification_failed", message },
        { status: 500 },
      );
    }

    if (!verifyResult || verifyResult.type === "error") {
      return NextResponse.json(
        {
          ok: false,
          code: "verification_failed",
          message: verifyResult?.data?.message || "Verification failed",
        },
        { status: 502 },
      );
    }

    // Policy denied — propagate the advisory so the UI can explain
    if (verifyResult.type === "verification_skipped") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        recommended_type: verifyResult.data.recommended_type,
        reasoning: verifyResult.data.reasoning,
        alternatives: verifyResult.data.alternatives,
      });
    }

    if (verifyResult.type !== "verification_status") {
      return NextResponse.json(
        {
          ok: false,
          code: "unexpected_response",
          message: `Unexpected response type: ${verifyResult.type}`,
        },
        { status: 502 },
      );
    }

    // Re-fetch the action projection so the client can refresh its drawer
    // without an extra round-trip. The engine context was just rebuilt
    // inside server.verify() → executeVerification(), so this is a pure
    // in-memory read.
    const actionsAfter = server.callTool("get_action_projections");
    const updatedAction =
      actionsAfter.type === "action_projections"
        ? actionsAfter.data.find((a: { id: string }) => a.id === actionId)
        : null;

    return NextResponse.json({
      ok: true,
      skipped: false,
      verification: verifyResult.data,
      action: updatedAction,
    });
  },
  { endpoint: "/api/verification/run", method: "POST" },
);
