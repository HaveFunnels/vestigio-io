import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import {
	buildTrafficStatement,
	type StatementSessionInput,
} from "../../../../packages/strategy-plan/sections/traffic-statement";

/**
 * GET /api/traffic-statement — Authenticated.
 *
 * The first v2 surface: which paid campaigns bought arrivals that did
 * nothing. Reads session aggregates the pixel has been collecting for
 * months and never grouped by campaign.
 *
 * Window is 30 days by default. No money in the response on purpose:
 * see the module header in traffic-statement.ts.
 */
const WINDOW_DAYS = 30;
/** Sessions pulled per request. 30 days on the instrumented account is
 *  ~65k, and the aggregate JSON is small, but an unbounded findMany on
 *  the busiest table is how a page becomes a timeout. */
const MAX_ROWS = 120_000;

export async function GET(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const orgCtx = await resolveOrgContext();
	if (!orgCtx.orgId || !orgCtx.envId) {
		return NextResponse.json({ statement: null, reason: "no-environment" });
	}

	const url = new URL(request.url);
	const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || WINDOW_DAYS));
	const end = new Date();
	const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

	try {
		const { prisma } = await import("@/libs/prismaDb");

		// conversionModel decides what "the action" means, so a service
		// business is not judged on reaching a checkout it does not have.
		// Read per organization because that is where BusinessProfile
		// lives; the figure is a shape, not a money input, so the
		// sibling-contamination problem that affects revenue does not
		// apply here.
		const profile = await prisma.businessProfile
			.findUnique({
				where: { organizationId: orgCtx.orgId },
				select: { conversionModel: true },
			})
			.catch(() => null);

		const rows = await prisma.behavioralSessionAggregate.findMany({
			where: { envId: orgCtx.envId, startedAt: { gte: start, lt: end } },
			select: { aggregate: true, eventCount: true },
			take: MAX_ROWS,
		});

		const parsed: StatementSessionInput[] = [];
		for (const r of rows) {
			try {
				parsed.push({
					aggregate: JSON.parse(r.aggregate) as Record<string, unknown>,
					eventCount: r.eventCount,
				});
			} catch {
				// A malformed aggregate drops the session rather than the
				// request. One bad row must not blank the statement.
			}
		}

		const statement = buildTrafficStatement(parsed, {
			windowStart: start.toISOString().slice(0, 10),
			windowEnd: end.toISOString().slice(0, 10),
			conversionModel: profile?.conversionModel ?? null,
		});

		return NextResponse.json({ statement });
	} catch (err) {
		console.error("[traffic-statement]", err);
		return NextResponse.json({ message: "Failed to build statement" }, { status: 500 });
	}
}
