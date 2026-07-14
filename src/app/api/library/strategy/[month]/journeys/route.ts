import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { selectTopJourneys, type JourneyReplay } from "@/lib/journey-replays";
import { narrateJourney, type JourneyNarrative } from "@/lib/journey-narrator";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]/journeys?envId=<id>
//
// Bundle D — Buyer Journey Replays. Retorna até 3 jornadas
// representativas de problemas (abandonos / drop-offs / desvios),
// cada uma com narrativa estruturada gerada por LLM.
//
// Quando não há sessões suficientes (pixel não instalado, env
// novo), retorna {pixel_required: true, journeys: []} pra UI
// renderizar o hero de instalação.
//
// Auth: caller precisa ser owner / member da org dona do env.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

const MIN_SESSIONS_FOR_JOURNEYS = 5;

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

	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// IDOR check — mesmo padrão de /strategy/[month] + /analysis-stats.
	// Wave 22.9 · Bloco 3 — org.locale is threaded through so the
	// journey narrator system prompt speaks the right language (Onda 2
	// hardcoded pt-BR, blocking en/es/de customers).
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		include: {
			organization: {
				select: {
					ownerId: true,
					locale: true,
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

	const monthStart = new Date(`${month}-01T00:00:00Z`);
	const monthEnd = new Date(
		Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
	);

	// Counta sessions distintas pra decidir se rodamos seleção OU se
	// devolvemos pixel_required. Evita rodar aggregateSession 100 vezes
	// pra concluir que tem 0 sessions.
	const distinctSessions = await prisma.rawBehavioralEvent
		.groupBy({
			by: ["sessionId"],
			where: {
				envId,
				receivedAt: { gte: monthStart, lt: monthEnd },
			},
			_count: { _all: true },
		})
		.then((rows) => rows.length)
		.catch(() => 0);

	if (distinctSessions < MIN_SESSIONS_FOR_JOURNEYS) {
		return NextResponse.json({
			pixel_required: true,
			session_count_this_month: distinctSessions,
			min_required: MIN_SESSIONS_FOR_JOURNEYS,
			env_id: envId,
			journeys: [],
		});
	}

	const journeys = await selectTopJourneys(envId, monthStart, monthEnd, 3);

	// Locale for the narrator prompt — org.locale is the single source
	// of truth per the Organization schema. Falls back to pt-BR when
	// the org row somehow lacks a locale (very old records, shell org
	// mid-onboarding).
	const narratorLocale = env.organization?.locale ?? "pt-BR";

	// Narração em paralelo. Cada chamada de LLM falha gracefully
	// (template fallback), então Promise.all não rejeita.
	const narratives: JourneyNarrative[] = await Promise.all(
		journeys.map((j) =>
			narrateJourney(j, {
				organizationId: env.organizationId,
				environmentId: env.id,
				cycleId: undefined,
				locale: narratorLocale,
			}),
		),
	);

	const enriched: Array<JourneyReplay & { narrative: JourneyNarrative }> = journeys.map(
		(j, i) => ({ ...j, narrative: narratives[i] }),
	);

	return NextResponse.json({
		pixel_required: false,
		session_count_this_month: distinctSessions,
		journeys: enriched,
	});
}
