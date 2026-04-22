import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { resolveOrgContext } from "@/libs/resolve-org";
import { rateLimitByKey } from "@/libs/limiter";
import {
	recordProductEvent,
	PRODUCT_EVENT_TYPES,
} from "@/libs/product-telemetry";

/**
 * POST /api/product-events
 *
 * Fire-and-forget product telemetry ingestion. Authenticated users only.
 * Returns 200 even for unknown events (never break the client for telemetry).
 * Rate limited: 120 req/min per userId.
 */
export async function POST(req: NextRequest) {
	// Auth — must have a session
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ ok: false }, { status: 401 });
	}

	const userId = (user as any).id;
	if (!userId) {
		return NextResponse.json({ ok: false }, { status: 401 });
	}

	// Rate limit — generous (120/min) to cover rapid page navigation
	try {
		await rateLimitByKey(`product-events:${userId}`, 120, 60_000);
	} catch {
		return NextResponse.json({ ok: false }, { status: 429 });
	}

	try {
		const body = await req.json();
		const { event, properties, pathname, sessionId } = body;

		// Silently drop unknown events — never error on telemetry
		if (!event || typeof event !== "string" || !PRODUCT_EVENT_TYPES.has(event)) {
			return NextResponse.json({ ok: true });
		}

		// Resolve org context server-side (authoritative source for orgId/envId)
		const orgCtx = await resolveOrgContext();

		// Skip demo/admin context
		if (orgCtx.orgId === "demo") {
			return NextResponse.json({ ok: true });
		}

		// Fire-and-forget write — recordProductEvent never throws
		recordProductEvent({
			userId,
			orgId: orgCtx.orgId,
			environmentId: orgCtx.envId || undefined,
			event,
			properties: properties || null,
			pathname: typeof pathname === "string" ? pathname : "/",
			sessionId: typeof sessionId === "string" ? sessionId : "unknown",
		});

		return NextResponse.json({ ok: true });
	} catch {
		// Even parse errors return 200 — telemetry should never surface errors
		return NextResponse.json({ ok: true });
	}
}
