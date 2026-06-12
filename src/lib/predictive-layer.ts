import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Bundle E — Predictive Layer
//
// Move a Vestigio de "te conto o que aconteceu" pra "te alerto antes".
// Engine determinística sem ML: agrega Findings por semana, faz
// regressão linear simples por pack, extrapola pra 3/6/12 semanas,
// e flagrá itens crônicos (open > 4 semanas com severity alta).
//
// Histórico mínimo: 4 semanas com dado. Abaixo disso retorna estado
// "needs_more_data" — UI mostra hero pedindo paciência.
// ──────────────────────────────────────────────

export interface TrendPoint {
	week_starting: string; // ISO date (Mondays UTC)
	count: number; // open findings of this pack at end of week
	midpoint_brl_cents: number; // exposure total
}

export interface PackTrend {
	pack: string;
	display_label: string;
	data_points: TrendPoint[]; // últimas N semanas (~12)
	trend_direction: "up" | "down" | "flat";
	slope_per_week: number; // findings/semana (count delta)
	current_count: number;
	current_midpoint_brl_cents: number;
	forecast_3_weeks: { count: number; midpoint_brl_cents: number };
	forecast_6_weeks: { count: number; midpoint_brl_cents: number };
	forecast_12_weeks: { count: number; midpoint_brl_cents: number };
	/** Indica se a extrapolação cruza thresholds críticos */
	will_breach_critical: boolean;
	breach_label: string | null; // "Atinge R$ 50k de exposição em ~6 semanas"
}

export interface ChronicFinding {
	id: string;
	inference_key: string;
	humanized_title: string;
	surface: string;
	severity: string;
	pack: string;
	weeks_open: number;
	impact_midpoint_brl_cents: number;
}

export interface PredictiveSummary {
	state: "ready" | "needs_more_data";
	weeks_of_history: number;
	trends: PackTrend[];
	chronic_findings: ChronicFinding[];
	breach_alerts: BreachAlert[];
}

export interface BreachAlert {
	pack: string;
	display_label: string;
	kind: "count" | "exposure";
	weeks_until_breach: number;
	threshold_label: string; // "10 achados em aberto" | "R$ 50k de exposição"
	current_value: number;
}

const PACK_LABEL_PTBR: Record<string, string> = {
	revenue_integrity: "Integridade da receita",
	chargeback_resilience: "Resiliência a chargeback",
	scale_readiness: "Preparo para escala",
	saas_growth_readiness: "Preparo para crescer SaaS",
	copy_alignment: "Consistência da mensagem",
	channel_integrity: "Integridade do canal",
	discoverability: "Descoberta",
	brand_integrity: "Integridade da marca",
	funnel_journey: "Jornada de compra",
	funnel_integrity: "Integridade do funil",
	first_impression_revenue: "Primeira impressão",
	action_value_map: "Mapa de valor da ação",
	acquisition_integrity: "Integridade da aquisição",
	mobile_revenue_exposure: "Receita exposta no mobile",
	friction_tax: "Imposto de fricção",
	trust_revenue_gap: "Lacuna de confiança",
	path_efficiency: "Eficiência do caminho",
	payment_health: "Saúde dos pagamentos",
	content_freshness: "Frescor do conteúdo",
	money_moment_exposure: "Exposição no momento da compra",
};

const WEEKS_HISTORY = 12;
const MIN_WEEKS_FOR_FORECAST = 4;
const CHRONIC_WEEKS_THRESHOLD = 4;
const COUNT_BREACH_THRESHOLD = 10;
const EXPOSURE_BREACH_THRESHOLD_CENTS = 50_000_00; // R$ 50k

export async function buildPredictiveSummary(
	envId: string,
	asOf: Date = new Date(),
): Promise<PredictiveSummary> {
	const weeks = buildWeekRange(asOf, WEEKS_HISTORY);

	// Para cada semana, conta findings em aberto no fim da janela
	// (criados antes do fim da semana + ainda não resolved até lá).
	// Aggregate por pack pra produzir as séries.
	const allFindings = await prisma.finding.findMany({
		where: { environmentId: envId },
		select: {
			id: true,
			inferenceKey: true,
			surface: true,
			severity: true,
			pack: true,
			createdAt: true,
			statusChangedAt: true,
			status: true,
			impactMidpoint: true,
		},
	});

	// State de dado: quantas semanas têm ao menos 1 finding criada?
	const distinctWeeksWithData = new Set<string>();
	for (const f of allFindings) {
		const wk = startOfWeekUtc(f.createdAt);
		distinctWeeksWithData.add(wk.toISOString().slice(0, 10));
	}
	if (distinctWeeksWithData.size < MIN_WEEKS_FOR_FORECAST) {
		return {
			state: "needs_more_data",
			weeks_of_history: distinctWeeksWithData.size,
			trends: [],
			chronic_findings: [],
			breach_alerts: [],
		};
	}

	// ── Trends por pack ──
	const packToFindings = new Map<string, typeof allFindings>();
	for (const f of allFindings) {
		const arr = packToFindings.get(f.pack) ?? [];
		arr.push(f);
		packToFindings.set(f.pack, arr);
	}

	const trends: PackTrend[] = [];
	for (const [pack, findings] of packToFindings.entries()) {
		const dataPoints = computeWeeklyOpen(findings, weeks);
		// Skip packs sem nenhum movimento nas últimas semanas
		const hasAnyMovement = dataPoints.some((p) => p.count > 0);
		if (!hasAnyMovement) continue;

		const counts = dataPoints.map((d) => d.count);
		const exposures = dataPoints.map((d) => d.midpoint_brl_cents);
		const slope = linearSlope(counts);
		const direction = classifyDirection(slope, counts);

		const currentCount = counts[counts.length - 1];
		const currentExposure = exposures[exposures.length - 1];
		const slopeExposure = linearSlope(exposures);

		const forecast3 = {
			count: Math.max(0, Math.round(currentCount + slope * 3)),
			midpoint_brl_cents: Math.max(0, Math.round(currentExposure + slopeExposure * 3)),
		};
		const forecast6 = {
			count: Math.max(0, Math.round(currentCount + slope * 6)),
			midpoint_brl_cents: Math.max(0, Math.round(currentExposure + slopeExposure * 6)),
		};
		const forecast12 = {
			count: Math.max(0, Math.round(currentCount + slope * 12)),
			midpoint_brl_cents: Math.max(0, Math.round(currentExposure + slopeExposure * 12)),
		};

		const willBreach =
			forecast6.count >= COUNT_BREACH_THRESHOLD ||
			forecast6.midpoint_brl_cents >= EXPOSURE_BREACH_THRESHOLD_CENTS;
		const breachLabel = willBreach
			? buildBreachLabel(forecast6, currentCount, currentExposure)
			: null;

		trends.push({
			pack,
			display_label: PACK_LABEL_PTBR[pack] ?? humanizeKey(pack),
			data_points: dataPoints,
			trend_direction: direction,
			slope_per_week: slope,
			current_count: currentCount,
			current_midpoint_brl_cents: currentExposure,
			forecast_3_weeks: forecast3,
			forecast_6_weeks: forecast6,
			forecast_12_weeks: forecast12,
			will_breach_critical: willBreach,
			breach_label: breachLabel,
		});
	}

	// Ordena por slope desc (mais perigosos primeiro)
	trends.sort((a, b) => b.slope_per_week - a.slope_per_week);

	// ── Chronic findings ──
	const now = asOf;
	const chronicCutoff = new Date(now.getTime() - CHRONIC_WEEKS_THRESHOLD * 7 * 86400 * 1000);
	const chronicRaw = allFindings.filter(
		(f) =>
			(f.status === "created" || f.status === "confirmed") &&
			f.createdAt < chronicCutoff &&
			(f.severity === "critical" || f.severity === "high"),
	);
	chronicRaw.sort((a, b) => {
		// Mais antigo + mais impacto primeiro
		const aScore =
			(now.getTime() - a.createdAt.getTime()) / 1000 / 86400 / 7 + (a.impactMidpoint ?? 0) / 1000;
		const bScore =
			(now.getTime() - b.createdAt.getTime()) / 1000 / 86400 / 7 + (b.impactMidpoint ?? 0) / 1000;
		return bScore - aScore;
	});
	const chronic: ChronicFinding[] = chronicRaw.slice(0, 6).map((f) => ({
		id: f.id,
		inference_key: f.inferenceKey,
		humanized_title: humanizeKey(f.inferenceKey),
		surface: f.surface,
		severity: f.severity,
		pack: f.pack,
		weeks_open: Math.floor((now.getTime() - f.createdAt.getTime()) / 1000 / 86400 / 7),
		impact_midpoint_brl_cents: Math.round((f.impactMidpoint ?? 0) * 100),
	}));

	// ── Breach alerts (top 3) ──
	const alerts: BreachAlert[] = [];
	for (const t of trends) {
		if (!t.will_breach_critical) continue;
		const candidates: BreachAlert[] = [];
		if (t.forecast_6_weeks.count >= COUNT_BREACH_THRESHOLD && t.slope_per_week > 0) {
			const w = Math.ceil(
				(COUNT_BREACH_THRESHOLD - t.current_count) / Math.max(0.01, t.slope_per_week),
			);
			candidates.push({
				pack: t.pack,
				display_label: t.display_label,
				kind: "count",
				weeks_until_breach: Math.max(1, w),
				threshold_label: `${COUNT_BREACH_THRESHOLD} achados em aberto`,
				current_value: t.current_count,
			});
		}
		if (
			t.forecast_6_weeks.midpoint_brl_cents >= EXPOSURE_BREACH_THRESHOLD_CENTS &&
			t.slope_per_week > 0
		) {
			const exposureSlope = linearSlope(
				t.data_points.map((p) => p.midpoint_brl_cents),
			);
			const w = Math.ceil(
				(EXPOSURE_BREACH_THRESHOLD_CENTS - t.current_midpoint_brl_cents) /
					Math.max(0.01, exposureSlope),
			);
			candidates.push({
				pack: t.pack,
				display_label: t.display_label,
				kind: "exposure",
				weeks_until_breach: Math.max(1, w),
				threshold_label: `R$ 50k de exposição`,
				current_value: Math.round(t.current_midpoint_brl_cents / 100),
			});
		}
		// Pega a alerta mais iminente
		candidates.sort((a, b) => a.weeks_until_breach - b.weeks_until_breach);
		if (candidates[0]) alerts.push(candidates[0]);
	}
	alerts.sort((a, b) => a.weeks_until_breach - b.weeks_until_breach);

	return {
		state: "ready",
		weeks_of_history: distinctWeeksWithData.size,
		trends: trends.slice(0, 6), // top 6 packs com maior slope
		chronic_findings: chronic,
		breach_alerts: alerts.slice(0, 3),
	};
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildWeekRange(asOf: Date, weeks: number): Date[] {
	const out: Date[] = [];
	const end = startOfWeekUtc(asOf);
	for (let i = weeks - 1; i >= 0; i--) {
		const d = new Date(end.getTime());
		d.setUTCDate(d.getUTCDate() - i * 7);
		out.push(d);
	}
	return out;
}

function startOfWeekUtc(d: Date): Date {
	const out = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	);
	const dow = out.getUTCDay() || 7; // 1 = Mon, 7 = Sun
	if (dow > 1) out.setUTCDate(out.getUTCDate() - (dow - 1));
	return out;
}

function computeWeeklyOpen(
	findings: Array<{
		createdAt: Date;
		statusChangedAt: Date | null;
		status: string;
		impactMidpoint: number;
	}>,
	weeks: Date[],
): TrendPoint[] {
	const out: TrendPoint[] = [];
	for (const w of weeks) {
		const weekEnd = new Date(w.getTime() + 7 * 86400 * 1000);
		let count = 0;
		let exposure = 0;
		for (const f of findings) {
			// Considerar "open at end of week" se:
			//   - createdAt <= weekEnd
			//   - e (status != resolved OR statusChangedAt > weekEnd)
			if (f.createdAt > weekEnd) continue;
			const resolvedBy =
				f.status === "resolved" && f.statusChangedAt && f.statusChangedAt <= weekEnd;
			if (resolvedBy) continue;
			count++;
			exposure += Math.round((f.impactMidpoint ?? 0) * 100);
		}
		out.push({
			week_starting: w.toISOString().slice(0, 10),
			count,
			midpoint_brl_cents: exposure,
		});
	}
	return out;
}

function linearSlope(values: number[]): number {
	// Regressão linear simples y = ax + b. Retorna a (slope).
	const n = values.length;
	if (n < 2) return 0;
	let sumX = 0,
		sumY = 0,
		sumXY = 0,
		sumX2 = 0;
	for (let i = 0; i < n; i++) {
		sumX += i;
		sumY += values[i];
		sumXY += i * values[i];
		sumX2 += i * i;
	}
	const denom = n * sumX2 - sumX * sumX;
	if (denom === 0) return 0;
	return (n * sumXY - sumX * sumY) / denom;
}

function classifyDirection(
	slope: number,
	values: number[],
): "up" | "down" | "flat" {
	const last = values[values.length - 1];
	const threshold = Math.max(0.3, last * 0.05); // 5% do valor atual
	if (slope > threshold) return "up";
	if (slope < -threshold) return "down";
	return "flat";
}

function buildBreachLabel(
	forecast: { count: number; midpoint_brl_cents: number },
	currentCount: number,
	currentExposure: number,
): string {
	const parts: string[] = [];
	if (forecast.count >= COUNT_BREACH_THRESHOLD && currentCount < COUNT_BREACH_THRESHOLD) {
		parts.push(`${forecast.count} achados em ~6 sem`);
	}
	if (
		forecast.midpoint_brl_cents >= EXPOSURE_BREACH_THRESHOLD_CENTS &&
		currentExposure < EXPOSURE_BREACH_THRESHOLD_CENTS
	) {
		const brl = Math.round(forecast.midpoint_brl_cents / 100);
		parts.push(`R$ ${(brl / 1000).toFixed(1)}k de exposição em ~6 sem`);
	}
	return parts.join(" · ") || "Cruza crítico em ~6 semanas";
}

function humanizeKey(key: string): string {
	return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
