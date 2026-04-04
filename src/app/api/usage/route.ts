import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { isAuthorized } from "@/libs/isAuthorized";
import { resolveOrgContext } from "@/libs/resolve-org";
import { getDailyUsageSummary } from "../../../../apps/platform/daily-usage";
import type { PlanKey } from "../../../../packages/plans";

/**
 * GET /api/usage — current user's daily usage summary
 * Returns usage data for the MCP usage indicator.
 */
export const GET = withErrorTracking(async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const orgCtx = await resolveOrgContext();
	const summary = await getDailyUsageSummary(orgCtx.orgId, orgCtx.plan as PlanKey);

	return NextResponse.json({
		...summary,
		domain: orgCtx.domain || null,
		envId: orgCtx.envId || null,
	});
}, { endpoint: "/api/usage", method: "GET" });
