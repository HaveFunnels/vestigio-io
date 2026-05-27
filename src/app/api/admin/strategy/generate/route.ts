import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { generateAndPersistPlan } from "../../../../../../packages/strategy-plan";

// ──────────────────────────────────────────────
// POST /api/admin/strategy/generate
//
// Admin-only one-shot trigger for the Monthly Strategy Plan generator.
// Body: { environmentId: string, month?: string, locale?: string }
//
// Used during Step 4 development + ops manual recovery before the
// Step 5 cron lands. The cron will call generateAndPersistPlan with
// the same args (just with leader-election + day-1 schedule).
//
// Returns the generated planId + cost telemetry on success. The
// full plan content is queryable via GET /api/library/strategy/[month].
// ──────────────────────────────────────────────

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Admin only" }, { status: 403 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const environmentId = body?.environmentId;
	if (typeof environmentId !== "string" || environmentId.length === 0) {
		return NextResponse.json(
			{ message: "environmentId is required" },
			{ status: 400 },
		);
	}

	// Default month: current UTC month.
	const month: string =
		body?.month ??
		`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	const locale: "pt-BR" | "en" | "es" | "de" = body?.locale ?? "pt-BR";

	const env = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: { id: true, domain: true },
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}

	const t0 = Date.now();
	try {
		const result = await generateAndPersistPlan(prisma, {
			environmentId,
			month,
			locale,
		});
		const durationMs = Date.now() - t0;

		console.log(
			`[api/admin/strategy/generate] env=${env.domain} month=${month} ` +
				`planId=${result.planId} llmCalls=${result.output.cost.llmCallsCount} ` +
				`cost=$${(result.output.cost.llmCostCents / 100).toFixed(4)} ` +
				`duration=${durationMs}ms`,
		);

		return NextResponse.json({
			ok: true,
			planId: result.planId,
			month,
			envDomain: env.domain,
			llmCallsCount: result.output.cost.llmCallsCount,
			llmCostCents: result.output.cost.llmCostCents,
			durationMs,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(
			`[api/admin/strategy/generate] env=${env.domain} month=${month} failed:`,
			msg,
		);
		return NextResponse.json(
			{ ok: false, error: msg.slice(0, 500) },
			{ status: 500 },
		);
	}
}
