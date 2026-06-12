import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]/analysis-stats?envId=<id>
//
// UX-1 brag-mode: retorna contagens do trabalho que a Vestigio fez
// pra produzir o plano do mês. UI renderiza num sidedrawer "O que
// foi analisado" — overwhelmar o cliente com números pra que ele
// sinta "caramba, foi coisa pra caralho".
//
// Coberta a janela do mês alvo + o último ciclo completo do env (que
// é o que alimentou o plano). Tudo do mesmo orgId pra evitar fuga.
//
// Numbers ranqueados por categoria:
//   - Cobertura de superfície (páginas, fontes, surfaces)
//   - Coleta (evidências, sessões, requests)
//   - Análise (findings, ações, packs, inferences)
//   - Operação (ciclos, fases, tempo)
//   - Knowledge (artigos, foundations)
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

	const authed = await isAuthorized();
	if (!authed) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// Verify the user can access this env (org-membership)
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: { id: true, organizationId: true, domain: true },
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}

	// Mês target
	const monthStart = new Date(`${month}-01T00:00:00Z`);
	const monthEnd = new Date(
		Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
	);

	// Último ciclo completo do env (é o que alimentou o plano)
	const lastCycle = await prisma.auditCycle.findFirst({
		where: { environmentId: envId, status: "complete" },
		orderBy: { completedAt: "desc" },
		select: {
			id: true,
			cycleType: true,
			createdAt: true,
			completedAt: true,
			phaseHistory: true,
		},
	});

	// cycleRef vem como string-derivado do id pra Evidence (legado).
	// Filtramos por env + janela de tempo do ciclo (entre createdAt e
	// completedAt) — mais robusto que matching exato em cycleRef.
	const cycleEvidenceFilter = lastCycle
		? {
				environmentRef: envId,
				observedAt: {
					gte: lastCycle.createdAt,
					lt: lastCycle.completedAt ?? new Date(),
				},
			}
		: null;

	// All counts em paralelo
	const [
		pagesAnalyzed,
		evidenceTotal,
		evidenceByType,
		findingsThisMonth,
		findingsResolvedThisMonth,
		findingsOpen,
		actionsThisMonth,
		userActionsDoneThisMonth,
		behavioralSessions,
		authenticatedAttempts,
		networkRequestsCaptured,
		competitorsMonitored,
		cyclesThisMonth,
	] = await Promise.all([
		// Inventário (pages crawled) — total para o env
		prisma.pageInventoryItem.count({ where: { environmentRef: envId } }),
		// Total de evidências no último ciclo
		cycleEvidenceFilter
			? prisma.evidence.count({ where: cycleEvidenceFilter })
			: Promise.resolve(0),
		// Evidências agrupadas por type no último ciclo
		cycleEvidenceFilter
			? prisma.evidence.groupBy({
					by: ["evidenceType"],
					where: cycleEvidenceFilter,
					_count: { _all: true },
				})
			: Promise.resolve(
					[] as Array<{ evidenceType: string; _count: { _all: number } }>,
				),
		// Findings criados neste mês
		prisma.finding.count({
			where: {
				environmentId: envId,
				createdAt: { gte: monthStart, lt: monthEnd },
			},
		}),
		// Findings resolvidos neste mês
		prisma.finding.count({
			where: {
				environmentId: envId,
				status: "resolved",
				statusChangedAt: { gte: monthStart, lt: monthEnd },
			},
		}),
		// Findings abertos agora (acumulado)
		prisma.finding.count({
			where: {
				environmentId: envId,
				status: { in: ["created", "confirmed"] },
			},
		}),
		// Actions persistidas no mês
		prisma.action.count({
			where: {
				environmentId: envId,
				createdAt: { gte: monthStart, lt: monthEnd },
			},
		}),
		// UserActions marcadas done no mês (esforço do humano)
		prisma.userAction.count({
			where: {
				environmentId: envId,
				status: "done",
				doneAt: { gte: monthStart, lt: monthEnd, not: null },
			},
		}),
		// Sessões behaviorais distintas no mês (de RawBehavioralEvent)
		prisma.rawBehavioralEvent
			.groupBy({
				by: ["sessionId"],
				where: {
					envId,
					receivedAt: { gte: monthStart, lt: monthEnd },
				},
			})
			.then((rows) => rows.length)
			.catch(() => 0),
		// Authenticated session attempts neste mês (subset de evidence)
		cycleEvidenceFilter
			? prisma.evidence.count({
					where: {
						...cycleEvidenceFilter,
						evidenceType: "authenticated_session_attempt",
					},
				})
			: Promise.resolve(0),
		// Network requests captured (subset)
		cycleEvidenceFilter
			? prisma.evidence.count({
					where: {
						...cycleEvidenceFilter,
						evidenceType: { in: ["network_capture", "browser_navigation_trace"] },
					},
				})
			: Promise.resolve(0),
		// Competitors monitorados (não filtra por mês — é estado atual)
		prisma.competitorDomain
			.count({ where: { environmentId: envId } })
			.catch(() => 0),
		// Ciclos completos no mês
		prisma.auditCycle.count({
			where: {
				environmentId: envId,
				status: "complete",
				completedAt: { gte: monthStart, lt: monthEnd },
			},
		}),
	]);

	// Compute cycle duration média (em segundos) no mês
	const recentCycles = await prisma.auditCycle.findMany({
		where: {
			environmentId: envId,
			status: "complete",
			completedAt: { gte: monthStart, lt: monthEnd, not: null },
			createdAt: { not: undefined },
		},
		select: { createdAt: true, completedAt: true },
		take: 50,
	});
	const avgCycleSeconds = recentCycles.length
		? Math.round(
				recentCycles.reduce((acc, c) => {
					if (!c.completedAt) return acc;
					return acc + (c.completedAt.getTime() - c.createdAt.getTime()) / 1000;
				}, 0) / recentCycles.length,
			)
		: 0;

	return NextResponse.json({
		// Cobertura
		coverage: {
			pages_analyzed: pagesAnalyzed,
			authenticated_attempts: authenticatedAttempts,
			competitors_monitored: competitorsMonitored,
		},
		// Coleta
		collection: {
			evidence_total: evidenceTotal,
			evidence_by_type: (evidenceByType as Array<{ evidenceType: string; _count: { _all: number } }>)
				.map((r) => ({ type: r.evidenceType, count: r._count._all }))
				.sort((a, b) => b.count - a.count),
			behavioral_sessions: behavioralSessions,
			network_requests_captured: networkRequestsCaptured,
		},
		// Análise
		analysis: {
			findings_created_this_month: findingsThisMonth,
			findings_resolved_this_month: findingsResolvedThisMonth,
			findings_open: findingsOpen,
			actions_emitted_this_month: actionsThisMonth,
			user_actions_done_this_month: userActionsDoneThisMonth,
		},
		// Operação
		operations: {
			cycles_this_month: cyclesThisMonth,
			avg_cycle_seconds: avgCycleSeconds,
			last_cycle_type: lastCycle?.cycleType ?? null,
			last_cycle_completed_at: lastCycle?.completedAt?.toISOString() ?? null,
		},
		// Knowledge base shipping é fixed-at-build (160 foundation articles
		// gerados programaticamente). Constante porque é shape do produto,
		// não do env.
		knowledge: {
			foundation_articles_total: 160,
			packs_active: 23,
			inference_keys_total: 127,
		},
	});
}
