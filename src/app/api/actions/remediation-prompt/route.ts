import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { isAuthorized } from "@/libs/isAuthorized";
import { resolveOrgContext } from "@/libs/resolve-org";
import { recordMcpQuery, canExecuteMcpQuery } from "../../../../../apps/platform/daily-usage";
import type { PlanKey } from "../../../../../packages/plans";
import { generateRemediationPrompt } from "@/libs/remediation-prompt";

const TOOL_HEADERS: Record<string, string> = {
	claude: "You are helping fix a website issue detected by Vestigio. Read the context below and implement the fix. Ask clarifying questions if the codebase structure is unclear.",
	codex: "Fix the following website issue. Apply changes directly to the codebase. Follow existing patterns.",
	cursor: "Read the issue below and implement the fix across the relevant files. Use @codebase to find the right files if needed.",
	windsurf: "Implement the fix described below. Use Cascade to apply changes across multiple files if needed.",
	lovable: "Apply the fix below to the project. Focus on the UI/frontend changes described in the remediation steps.",
	other: "Implement the fix described below. Follow existing code patterns and conventions.",
};

const VALID_TOOLS = Object.keys(TOOL_HEADERS);

/**
 * POST /api/actions/remediation-prompt
 *
 * Generates a tool-specific remediation prompt, consuming 1 AI interaction.
 * Body: { action: ActionProjection, tool: string }
 */
export const POST = withErrorTracking(async function POST(req: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const orgCtx = await resolveOrgContext();
	const plan = (orgCtx.plan || "vestigio") as PlanKey;
	const guard = await canExecuteMcpQuery(orgCtx.orgId, plan);
	if (guard.status === "blocked") {
		return NextResponse.json(
			{ message: guard.reason, mcp_remaining: 0 },
			{ status: 429 },
		);
	}

	const body = await req.json();
	const { action, tool } = body as { action?: any; tool?: string };
	if (!action?.title) {
		return NextResponse.json({ message: "action data required" }, { status: 400 });
	}

	const selectedTool = VALID_TOOLS.includes(tool || "") ? tool! : "other";

	const basePrompt = generateRemediationPrompt({
		action,
		domain: orgCtx.domain || undefined,
	});

	const prompt = `${TOOL_HEADERS[selectedTool]}\n\n${basePrompt}`;

	// Record 1 AI interaction (0 estimated tokens — no LLM call)
	await recordMcpQuery(orgCtx.orgId, 0);

	return NextResponse.json({
		prompt,
		tool: selectedTool,
		mcp_remaining: (guard.summary?.mcp_remaining ?? 1) - 1,
	});
}, { endpoint: "/api/actions/remediation-prompt", method: "POST" });
