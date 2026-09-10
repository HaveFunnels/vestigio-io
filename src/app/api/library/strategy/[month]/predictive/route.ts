import { isAuthorized } from "@/libs/isAuthorized";
import { verifyExportTokenForEnvMonth } from "@/libs/strategy-export-token";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { buildPredictiveSummary } from "@/lib/predictive-layer";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]/predictive?envId=<id>
//
// Bundle E — Predictive layer. Tendências semanais por pack +
// forecast linear + chronic findings + breach alerts.
//
// Estado "needs_more_data" quando o env tem < 4 semanas de dado.
// Auth: caller precisa ser owner / member da org dona do env.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}
	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// EXAME E3 — accept the PDF exporter's HMAC token as alt auth so
	// this section renders in the exported document (it was silently
	// 401-absent from every PDF). Verified against the plan for THIS
	// (envId, month).
	const exportToken = url.searchParams.get("export_token");
	const tokenAuthorized = exportToken
		? await verifyExportTokenForEnvMonth(prisma, exportToken, envId, month)
		: false;
	if (exportToken && !tokenAuthorized) {
		return NextResponse.json({ message: "Invalid export token" }, { status: 401 });
	}

	const user = tokenAuthorized ? null : await isAuthorized();
	if (!tokenAuthorized && !user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organizationId: true,
				organization: {
					select: {
						ownerId: true,
						memberships: { select: { userId: true } },
						locale: true,
					},
				},
		},
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}
	const userId = (user as { id?: string } | null)?.id;
	const isOwner = !!userId && env.organization?.ownerId === userId;
	const isMember = !!userId && !!env.organization?.memberships?.some((m) => m.userId === userId);
	const isSiteAdmin = (user as { role?: string } | null)?.role === "ADMIN";
	if (!tokenAuthorized && !isOwner && !isMember && !isSiteAdmin) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	// asOf = fim do mês alvo, pra que o cliente vendo o plano de Junho
	// veja a tendência usando dados até 30/Jun. Se o mês ainda está
	// em curso, usa now.
	const monthStart = new Date(`${month}-01T00:00:00Z`);
	const monthEnd = new Date(
		Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
	);
	const now = new Date();
	const asOf = monthEnd > now ? now : monthEnd;

	const summary = await buildPredictiveSummary(
		envId,
		asOf,
		env.organization?.locale ?? "pt-BR",
	);
	return NextResponse.json(summary);
}
