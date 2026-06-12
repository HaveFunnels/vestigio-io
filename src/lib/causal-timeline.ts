import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Bundle C — Causal Timeline Reconstruction
//
// Quando o cliente abre um finding, a Vestigio tenta reconstruir a
// história forense: quando essa finding apareceu pela primeira vez,
// qual foi o último ciclo em que ela NÃO existia, e que mudanças
// (decision/signal/regression) aconteceram no intervalo.
//
// Heurística MVP (deterministic, no LLM):
//   1. Acha o ciclo de origem (`createdAt` do Finding)
//   2. Acha o último ciclo ANTERIOR onde a mesma `inferenceKey` no
//      mesmo `environmentId` não aparecia (= "estado saudável anterior")
//   3. Entre essas duas datas, lista:
//        a. ciclos completos (com data + tipo)
//        b. Findings vizinhos (mesmo surface, mesma janela) — sinaliza
//           outras coisas que apareceram juntas
//   4. Calcula custo acumulado = midpoint mensal × meses desde origem
//
// Quando não há cadeia detectada (finding pré-existente, dado
// insuficiente, primeira observação no env), retorna empty state com
// label explícito. Sem inventar narrativa.
// ──────────────────────────────────────────────

export interface CausalTimelineEvent {
	at: string; // ISO date
	kind:
		| "finding_created"
		| "cycle_completed"
		| "neighbor_finding"
		| "status_transition"
		| "regression_detected"
		| "tech_added"
		| "tech_removed";
	title: string;
	detail: string | null;
}

export interface CausalTimelineResult {
	finding_id: string;
	finding_first_observed_at: string;
	finding_window_days: number; // days since first observation
	estimated_cost_accumulated_brl: number; // monthly midpoint × months since observed
	prior_state: {
		label: "healthy" | "not_observed" | "first_env_cycle" | "unknown";
		human_label: string; // PT-BR friendly
		cycle_ref: string | null;
		cycle_date: string | null;
	};
	events: CausalTimelineEvent[];
	/** When false, the UI renders an empty state. True = at least 1 event
	 *  beyond "finding_created" was reconstructed. */
	has_causal_chain: boolean;
}

const NEIGHBOR_WINDOW_DAYS = 7;
const SECONDS_PER_DAY = 86400;
const APPROX_DAYS_PER_MONTH = 30.44;

/**
 * Reconstruct causal timeline for a single finding. Returns null if the
 * finding doesn't exist or doesn't belong to the env (caller must
 * authorize separately).
 */
export async function reconstructCausalTimeline(
	findingId: string,
	envId: string,
): Promise<CausalTimelineResult | null> {
	const finding = await prisma.finding.findUnique({
		where: { id: findingId },
		select: {
			id: true,
			environmentId: true,
			inferenceKey: true,
			surface: true,
			createdAt: true,
			impactMidpoint: true,
			cycleRef: true,
			cycleId: true,
		},
	});
	if (!finding || finding.environmentId !== envId) return null;

	const firstObservedAt = finding.createdAt;
	const now = new Date();
	const windowDays = Math.max(
		0,
		Math.round((now.getTime() - firstObservedAt.getTime()) / 1000 / SECONDS_PER_DAY),
	);
	const monthsSinceObserved = windowDays / APPROX_DAYS_PER_MONTH;
	const estimatedCost = Math.round((finding.impactMidpoint ?? 0) * monthsSinceObserved);

	// ── Estado anterior ────────────────────────
	// Olha pra trás: quando foi a última vez que essa mesma inferenceKey
	// NÃO aparecia? Buscamos o ciclo completo anterior pra createdAt e
	// checamos se a finding já existia nele.
	const priorCycle = await prisma.auditCycle.findFirst({
		where: {
			environmentId: envId,
			status: "complete",
			completedAt: { lt: firstObservedAt, not: null },
		},
		orderBy: { completedAt: "desc" },
		select: { id: true, completedAt: true, cycleType: true },
	});

	let priorState: CausalTimelineResult["prior_state"];

	if (!priorCycle) {
		// Primeiro ciclo do env — não dá pra reconstruir nada anterior
		priorState = {
			label: "first_env_cycle",
			human_label: "Primeiro ciclo deste ambiente",
			cycle_ref: null,
			cycle_date: null,
		};
	} else {
		// Verifica se a inferenceKey já existia naquele ciclo anterior
		const priorFinding = await prisma.finding.findFirst({
			where: {
				environmentId: envId,
				inferenceKey: finding.inferenceKey,
				cycleId: priorCycle.id,
			},
			select: { id: true },
		});

		if (priorFinding) {
			// Já existia — então a "createdAt" do finding atual é só re-emissão
			// pelo lifecycle. Não temos um ponto saudável detectável neste
			// histórico curto.
			priorState = {
				label: "unknown",
				human_label: "Histórico insuficiente para identificar o início",
				cycle_ref: `audit_cycle:${priorCycle.id}`,
				cycle_date: priorCycle.completedAt?.toISOString() ?? null,
			};
		} else {
			// Não existia → ciclo anterior era saudável
			priorState = {
				label: "healthy",
				human_label: "Última observação saudável",
				cycle_ref: `audit_cycle:${priorCycle.id}`,
				cycle_date: priorCycle.completedAt?.toISOString() ?? null,
			};
		}
	}

	// ── Eventos da janela ──────────────────────
	const events: CausalTimelineEvent[] = [];

	// 0. Estado anterior saudável (se houver) — evento de "linha de base"
	if (priorState.label === "healthy" && priorState.cycle_date) {
		events.push({
			at: priorState.cycle_date,
			kind: "cycle_completed",
			title: "Estado saudável anterior",
			detail: "Este problema não estava presente nesta auditoria. Algo mudou entre este ciclo e o próximo.",
		});
	}

	// 1. Finding criada
	events.push({
		at: firstObservedAt.toISOString(),
		kind: "finding_created",
		title: "Vestigio identificou este problema",
		detail: monthsSinceObserved >= 1
			? `Há ${Math.round(monthsSinceObserved * 10) / 10} meses · ainda em aberto`
			: `Há ${windowDays} ${windowDays === 1 ? "dia" : "dias"} · ainda em aberto`,
	});

	// 1.5 Eventos finos: mudanças no stack entre o ciclo saudável anterior
	// e o ciclo onde a finding apareceu. Detecta novas tecnologias
	// (Klaviyo apareceu, GTM removido, etc.) — o sinal forense mais útil
	// pra "o que mudou".
	if (priorCycle?.completedAt && finding.cycleId) {
		const stackEvents = await detectStackChanges(
			envId,
			priorCycle.id,
			finding.cycleId,
			firstObservedAt,
		);
		events.push(...stackEvents);
	}

	// 2. Vizinhos: outros findings criados na mesma surface, ±NEIGHBOR_WINDOW_DAYS
	const neighborStart = new Date(firstObservedAt.getTime() - NEIGHBOR_WINDOW_DAYS * SECONDS_PER_DAY * 1000);
	const neighborEnd = new Date(firstObservedAt.getTime() + NEIGHBOR_WINDOW_DAYS * SECONDS_PER_DAY * 1000);
	const neighbors = await prisma.finding.findMany({
		where: {
			environmentId: envId,
			surface: finding.surface,
			createdAt: { gte: neighborStart, lte: neighborEnd },
			NOT: { id: finding.id },
		},
		select: {
			id: true,
			inferenceKey: true,
			createdAt: true,
			severity: true,
			pack: true,
		},
		take: 10,
		orderBy: { createdAt: "asc" },
	});

	for (const n of neighbors) {
		events.push({
			at: n.createdAt.toISOString(),
			kind: "neighbor_finding",
			title: humanizeInferenceKey(n.inferenceKey),
			detail: `Outra finding criada na mesma página (${n.pack}, severidade ${n.severity})`,
		});
	}

	// 3. Status transition mais recente (se houver)
	const recentChanges = await prisma.finding.findUnique({
		where: { id: findingId },
		select: { statusChangedAt: true, status: true },
	});
	if (recentChanges?.statusChangedAt && recentChanges.statusChangedAt > firstObservedAt) {
		events.push({
			at: recentChanges.statusChangedAt.toISOString(),
			kind: "status_transition",
			title: `Status atualizado: ${recentChanges.status}`,
			detail: null,
		});
	}

	// Ordena por data ASC
	events.sort((a, b) => (a.at < b.at ? -1 : 1));

	const hasTechEvents = events.some(
		(e) => e.kind === "tech_added" || e.kind === "tech_removed",
	);
	const hasCausalChain =
		priorState.label === "healthy" ||
		hasTechEvents ||
		neighbors.length > 0 ||
		events.length > 1;

	return {
		finding_id: findingId,
		finding_first_observed_at: firstObservedAt.toISOString(),
		finding_window_days: windowDays,
		estimated_cost_accumulated_brl: estimatedCost,
		prior_state: priorState,
		events,
		has_causal_chain: hasCausalChain,
	};
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function humanizeInferenceKey(key: string): string {
	// Snake_case → Title Case. Não é tradução — só readability.
	return key
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ──────────────────────────────────────────────
// Stack change detection — eventos finos
//
// Compara TechnologyDetected evidence entre dois ciclos. Retorna
// events de tech_added / tech_removed. Esse é o canal "Klaviyo
// apareceu, GTM removido" — o sinal forense que conecta mudanças
// concretas no site com o aparecimento da finding.
//
// Skipa silenciosamente quando não há dado (env novo, ciclos sem tech
// detection). Sem evento gerado = sem ruído.
// ──────────────────────────────────────────────

interface TechSnapshot {
	technology_key: string;
	display_name: string;
	category: string;
}

async function detectStackChanges(
	envId: string,
	priorCycleId: string,
	currentCycleId: string,
	stampAt: Date,
): Promise<CausalTimelineEvent[]> {
	const envRef = `environment:${envId}`;
	const [priorTech, currentTech] = await Promise.all([
		fetchTechFromCycle(envRef, priorCycleId),
		fetchTechFromCycle(envRef, currentCycleId),
	]);

	const priorByKey = new Map(priorTech.map((t) => [t.technology_key, t]));
	const currentByKey = new Map(currentTech.map((t) => [t.technology_key, t]));

	const events: CausalTimelineEvent[] = [];

	// Stampa tech events 1s ANTES da finding pra que apareçam acima na
	// timeline (sort ASC). Date renderiza igual à finding (1s não afeta
	// a precisão visual) — só garante a leitura cronológica correta:
	// "Klaviyo adicionado → Vestigio identificou problema".
	const techStamp = new Date(stampAt.getTime() - 1000).toISOString();

	for (const [key, tech] of currentByKey) {
		if (priorByKey.has(key)) continue;
		events.push({
			at: techStamp,
			kind: "tech_added",
			title: `${tech.display_name} adicionado ao site`,
			detail: `Categoria: ${humanizeCategory(tech.category)}`,
		});
	}

	for (const [key, tech] of priorByKey) {
		if (currentByKey.has(key)) continue;
		events.push({
			at: techStamp,
			kind: "tech_removed",
			title: `${tech.display_name} removido do site`,
			detail: `Categoria: ${humanizeCategory(tech.category)}`,
		});
	}

	// Cap em 6 eventos pra não estourar a UI quando muitas mudanças
	// acontecem no mesmo ciclo (ex: refator completo do front).
	return events.slice(0, 6);
}

async function fetchTechFromCycle(
	envRef: string,
	cycleId: string,
): Promise<TechSnapshot[]> {
	const rows = await prisma.evidence.findMany({
		where: {
			environmentRef: envRef,
			cycleRef: `audit_cycle:${cycleId}`,
			evidenceType: "technology_detected",
		},
		select: { payload: true },
		take: 200,
	});

	const byKey = new Map<string, TechSnapshot>();
	for (const row of rows) {
		try {
			const p = JSON.parse(row.payload as unknown as string) as Record<string, unknown>;
			const key = String(p.technology_key ?? "");
			if (!key || byKey.has(key)) continue;
			byKey.set(key, {
				technology_key: key,
				display_name: String(p.display_name ?? key),
				category: String(p.category ?? "other"),
			});
		} catch {
			// Skip malformed payload
		}
	}
	return Array.from(byKey.values());
}

function humanizeCategory(cat: string): string {
	const labels: Record<string, string> = {
		platform: "Plataforma",
		payment_provider: "Pagamento",
		analytics: "Analytics",
		tag_manager: "Tag manager",
		support_widget: "Suporte / Chat",
		consent_manager: "Cookie consent",
		error_tracking: "Error tracking",
		ab_testing: "A/B testing",
		cdn: "CDN",
		email_marketing: "Email marketing",
		other: "Outros",
	};
	return labels[cat] ?? cat;
}
