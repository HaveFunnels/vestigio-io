// ──────────────────────────────────────────────
// Behavioral measurement — what the pixel MEASURED.
//
// This is the one section of the plan allowed to use the word
// "medido". Everything else in the document is inference over crawl
// evidence or a severity-based estimate; these numbers are counts over
// sessions the customer's own visitors produced.
//
// It exists because of the closing point of the casamontelle
// cross-examination: the TikTok alert (2-second median sessions, 94%
// never reaching 25% scroll) lived in an internal calibration document
// while the paid plan ran entirely on crawl heuristics — "o plano
// trocou o que o pixel mediu por aquilo que o crawler infere". Their
// own checkout telemetry later confirmed the alert's direction with
// independent data (28s vs 120s dwell, 8.5% vs 27.5% conversion),
// which is precisely the kind of insight the plan was failing to
// deliver while it was busy citing /pricing pages that don't exist.
//
// Sources of truth and their limits, stated because the reader of this
// output will be cross-examined again:
//   - Rows come from BehavioralSessionAggregate (sessions reduced once
//     at rest), windowed on the TRAILING 30 days from generation, not
//     the calendar month — "current behavior", labeled as such.
//   - Bot filter is minimal and disclosed: sessions with fewer than 2
//     events are excluded (single-beacon hits carry no behavior). The
//     excluded count ships in the output rather than vanishing.
//   - Scroll milestones are 25/50/75/90 — "no scroll" here means the
//     25% milestone never fired, and the output says so.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { canonicalSourceKey, sourceIdentity } from "../../behavioral/source-identity";
import type { GenerateContext } from "../types";

const WINDOW_DAYS = 30;
const MIN_EVENTS_HUMAN = 2;

/** A source needs this many filtered sessions before we compare it or
 *  alert on it — medians over a handful of visits are noise. */
const MIN_SESSIONS_FOR_SOURCE = 100;

export interface BehavioralSourceStats {
	source: string;
	sessions: number;
	sharePct: number;
	medianDurationS: number;
	pctNoScroll: number;
	/** Sessions where a form inside the site was focused. */
	pctFormStarted: number;
}

export interface BehavioralAlert {
	kind: "no_intent_traffic";
	source: string;
	medianDurationS: number;
	pctNoScroll: number;
	sessions: number;
	/** Pre-written, measurement-honest sentence for direct rendering. */
	text: string;
}

export interface BehavioralMeasurementOutput {
	basis: "pixel_measured";
	windowStart: string;
	windowEnd: string;
	windowDays: number;
	sessionsTotal: number;
	sessionsFiltered: number;
	/** Excluded by the bot filter (fewer than MIN_EVENTS_HUMAN events). */
	sessionsExcluded: number;
	scrollNote: string;
	sources: BehavioralSourceStats[];
	alerts: BehavioralAlert[];
}

interface AggRow {
	aggregate: string;
	eventCount: number;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

// EXAME A2 — canonical key from the ONE shared identity module. The
// plan persists the key; every customer-facing string renders the
// module's label (never the raw lowercase utm token).
function normalizeSource(raw: string | null | undefined): string {
	return canonicalSourceKey({ source: raw ?? null });
}

export async function generateBehavioralMeasurement(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<BehavioralMeasurementOutput | null> {
	const windowEnd = new Date();
	const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const rows: AggRow[] = await prisma.behavioralSessionAggregate.findMany({
		where: {
			envId: ctx.environmentId,
			startedAt: { gte: windowStart, lt: windowEnd },
		},
		select: { aggregate: true, eventCount: true },
	});

	// No pixel, or pixel just installed: the section simply does not
	// exist. An empty measured section would invite exactly the
	// asserting-absence mistake the rest of this cycle was about.
	if (rows.length === 0) return null;

	type Parsed = {
		source: string;
		durationS: number;
		noScroll: boolean;
		formStarted: boolean;
	};
	const sessionsTotal = rows.length;
	const parsed: Parsed[] = [];
	let excluded = 0;

	for (const row of rows) {
		if (row.eventCount < MIN_EVENTS_HUMAN) {
			excluded++;
			continue;
		}
		try {
			const agg = JSON.parse(row.aggregate) as {
				attribution?: { first_touch?: { source?: string | null } };
				session_duration_ms?: number;
				max_scroll_depth?: number;
				form_started?: boolean;
			};
			parsed.push({
				source: normalizeSource(agg.attribution?.first_touch?.source),
				durationS: Math.round((agg.session_duration_ms ?? 0) / 1000),
				noScroll: (agg.max_scroll_depth ?? 0) === 0,
				formStarted: agg.form_started === true,
			});
		} catch {
			excluded++; // unparseable aggregate — treat as excluded, count it
		}
	}

	const bySource = new Map<string, Parsed[]>();
	for (const p of parsed) {
		const list = bySource.get(p.source);
		if (list) list.push(p);
		else bySource.set(p.source, [p]);
	}

	const sources: BehavioralSourceStats[] = [...bySource.entries()]
		.filter(([, list]) => list.length >= MIN_SESSIONS_FOR_SOURCE)
		.map(([source, list]) => ({
			source,
			sessions: list.length,
			sharePct: Math.round((100 * list.length) / parsed.length),
			medianDurationS: median(list.map((p) => p.durationS)),
			pctNoScroll: Math.round((100 * list.filter((p) => p.noScroll).length) / list.length),
			pctFormStarted: Math.round(
				(100 * list.filter((p) => p.formStarted).length) / list.length,
			),
		}))
		.sort((a, b) => b.sessions - a.sessions);

	// Alert: a source whose median session is under 10 seconds and where
	// more than 80% never reach the first scroll milestone is buying
	// arrivals, not visits. Both thresholds sit far from the measured
	// behavior of sources that do engage (facebook: 32s median, 78%
	// no-scroll on the same store), so tripping this requires being
	// dramatically worse than the worst engaged source, not merely bad.
	const alerts: BehavioralAlert[] = sources
		.filter((s) => s.medianDurationS < 10 && s.pctNoScroll > 80)
		.map((s) => ({
			kind: "no_intent_traffic" as const,
			source: s.source,
			medianDurationS: s.medianDurationS,
			pctNoScroll: s.pctNoScroll,
			sessions: s.sessions,
			text:
				`Medido pelo pixel nos últimos ${WINDOW_DAYS} dias: as ${s.sessions.toLocaleString("pt-BR")} sessões vindas de ${sourceIdentity(s.source).label} ` +
				`ficam ${s.medianDurationS}s no site (mediana) e ${s.pctNoScroll}% delas saem sem rolar a primeira tela. ` +
				`Esse tráfego está chegando e indo embora antes de ver a oferta. Se há verba nessa origem, ela está comprando chegadas, não visitas.`,
		}));

	return {
		basis: "pixel_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		windowDays: WINDOW_DAYS,
		sessionsTotal,
		sessionsFiltered: parsed.length,
		sessionsExcluded: excluded,
		scrollNote:
			"Scroll é medido em marcos de 25/50/75/90% — 'sem rolar' significa que o marco de 25% nunca disparou.",
		sources,
		alerts,
	};
}
