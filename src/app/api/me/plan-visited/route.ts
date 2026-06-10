import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// POST /api/me/plan-visited — best-effort write of `lastPlanVisitedAt`
// called by the Strategy Plan page on mount. No body required.
//
// Used downstream by:
//   - re-engagement cron (gap > 14d → "we noticed you haven't checked
//     your plan" email — not implemented yet, just the signal)
//   - admin at-risk report (gap > 30d → customer success outreach)
//
// Failures are silent on purpose: if this 500s, the customer still got
// the plan, and the next visit overwrites it. Never let stalling-signal
// writes block a page render.
export async function POST() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ ok: false }, { status: 401 });
	}
	try {
		await prisma.user.update({
			where: { id: (user as any).id },
			data: { lastPlanVisitedAt: new Date() },
		});
	} catch (err) {
		// Log but don't fail — the column may be missing in dev DBs that
		// haven't run the migration yet. Best-effort signal, not a
		// transaction guarantee.
		console.warn(
			"[plan-visited] write failed:",
			err instanceof Error ? err.message : err,
		);
		return NextResponse.json({ ok: false }, { status: 200 });
	}
	return NextResponse.json({ ok: true });
}
