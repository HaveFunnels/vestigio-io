import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { reconstructCausalTimeline } from "@/lib/causal-timeline";

// ──────────────────────────────────────────────
// GET /api/findings/[id]/causal-timeline?envId=<id>
//
// Bundle C — Forensic depth. Retorna a reconstrução causal pra um
// finding específico:
//   - primeira observação + tempo decorrido + custo acumulado
//   - estado anterior (saudável / não-observado / primeiro ciclo)
//   - eventos da janela (finding criada, vizinhos, transitions)
//
// Auth: caller precisa ser owner / member da org dona do env.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
	const { id: findingId } = await params;
	if (!findingId) {
		return NextResponse.json({ message: "id is required" }, { status: 400 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// IDOR check — mirror pattern do parent strategy route. User precisa
	// pertencer à org dona do env antes de qualquer query de finding.
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organizationId: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}
	const userId = (user as { id?: string }).id;
	const isOwner = !!userId && env.organization?.ownerId === userId;
	const isMember = !!userId && !!env.organization?.memberships?.some((m) => m.userId === userId);
	const isSiteAdmin = (user as { role?: string }).role === "ADMIN";
	if (!isOwner && !isMember && !isSiteAdmin) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const result = await reconstructCausalTimeline(findingId, envId);
	if (!result) {
		return NextResponse.json(
			{ message: "Finding not found or does not belong to env" },
			{ status: 404 },
		);
	}

	return NextResponse.json(result);
}
