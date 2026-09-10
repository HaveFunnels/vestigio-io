// ──────────────────────────────────────────────
// "O que mudou no site" — the longitudinal section (ONDA 2.3)
//
// EXAME §2.5: PageProbe rows (daily content hash + status + latency
// per page) were written and read by NOTHING in the plan — the probe's
// only effect was firing a re-narration that had no access to the diff
// that caused it. This section is the month-2 retention engine: the
// customer opens the new plan and the first longitudinal question —
// "o que mudou desde o último?" — has a measured answer.
//
// Honesty rules:
//   - "Caiu" requires a REAL transition: the page answered 2xx/3xx in
//     the window and its latest TWO probes are >= 400 (two, so a
//     single flaky probe never announces an outage).
//   - "Voltou" is the mirror: a >=400 streak in the window, healthy now.
//   - "Conteúdo mudou" counts changedFromPrior=true probes (hash diff
//     against the immediately prior probe — computed at write time).
//   - "Ficou mais lenta" compares median fetchMs of the first vs last
//     half of the window's probes: >= 2x AND >= 1500ms now. Medians,
//     not means — one slow probe is noise.
//   - No probes in the window → null (section absent). Probes but no
//     movement → an explicit quiet state ("monitorado, sem mudanças
//     estruturais"), which is itself the always-on proof.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";

export interface WhatChangedRow {
	kind: "went_down" | "came_back" | "content_changed" | "slower";
	path: string;
	/** Pre-written, locale-aware sentence for direct rendering. */
	detail: string;
	/** Sort weight — down > slower > came_back > changed. */
	weight: number;
	/** ISO date of the most relevant observation. */
	observedAt: string;
}

export interface WhatChangedOutput {
	basis: "probe_measured";
	windowStart: string;
	windowEnd: string;
	/** Distinct pages probed in the window. */
	probedPages: number;
	rows: WhatChangedRow[];
}

export interface ProbeRowInput {
	url: string;
	statusCode: number;
	fetchMs: number;
	changedFromPrior: boolean | null;
	observedAt: Date;
}

const MAX_ROWS = 10;
const SLOW_FACTOR = 2;
const SLOW_FLOOR_MS = 1500;

function pathOf(url: string): string {
	try {
		return new URL(url).pathname || "/";
	} catch {
		return url;
	}
}

function median(ns: number[]): number {
	if (ns.length === 0) return 0;
	const s = [...ns].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

const ok = (status: number) => status >= 200 && status < 400;

/** Pure diff over the window's probes — tested. */
export function computeWhatChanged(
	probes: ProbeRowInput[],
	windowStart: Date,
	windowEnd: Date,
	locale: string,
): WhatChangedOutput | null {
	if (probes.length === 0) return null;
	const pt = locale === "pt-BR";

	const byUrl = new Map<string, ProbeRowInput[]>();
	for (const p of probes) {
		const list = byUrl.get(p.url);
		if (list) list.push(p);
		else byUrl.set(p.url, [p]);
	}

	const rows: WhatChangedRow[] = [];
	for (const [url, list] of byUrl.entries()) {
		list.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
		const path = pathOf(url);
		const last = list[list.length - 1];
		const prevLast = list[list.length - 2];

		const everOk = list.some((p) => ok(p.statusCode));
		const everDown = list.some((p) => !ok(p.statusCode));

		// Down NOW: last two probes failing, and it was alive in-window.
		if (
			everOk &&
			prevLast &&
			!ok(last.statusCode) &&
			!ok(prevLast.statusCode)
		) {
			rows.push({
				kind: "went_down",
				path,
				weight: 0,
				observedAt: last.observedAt.toISOString().slice(0, 10),
				detail: pt
					? `${path} respondia normalmente e agora retorna HTTP ${last.statusCode} (confirmado em 2 verificações seguidas).`
					: `${path} was answering normally and now returns HTTP ${last.statusCode} (confirmed on 2 consecutive checks).`,
			});
			continue; // down dominates every other observation for the page
		}

		// Came back: failed in-window, healthy now.
		if (everDown && ok(last.statusCode)) {
			const downCount = list.filter((p) => !ok(p.statusCode)).length;
			rows.push({
				kind: "came_back",
				path,
				weight: 2,
				observedAt: last.observedAt.toISOString().slice(0, 10),
				detail: pt
					? `${path} falhou em ${downCount} ${downCount === 1 ? "verificação" : "verificações"} no período e voltou a responder normalmente.`
					: `${path} failed ${downCount} check(s) in the window and is answering normally again.`,
			});
		}

		// Content changes. A page whose hash flips on MOST checks is a
		// DYNAMIC page (rotating banners, randomized product grids) — 288
		// "changes" on the Casa Montelle homepage were the page working
		// as designed, not 288 pieces of news. Above the ratio threshold
		// the row says so honestly instead of shouting a change count
		// that means nothing; below it, discrete changes are real edits.
		const comparable = list.filter((p) => p.changedFromPrior !== null).length;
		const changes = list.filter((p) => p.changedFromPrior === true);
		const dynamicPage = comparable >= 6 && changes.length / comparable > 0.5;
		if (changes.length > 0 && !dynamicPage) {
			const lastChange = changes[changes.length - 1];
			rows.push({
				kind: "content_changed",
				path,
				weight: 3,
				observedAt: lastChange.observedAt.toISOString().slice(0, 10),
				detail: pt
					? `O conteúdo de ${path} mudou ${changes.length === 1 ? "1 vez" : `${changes.length} vezes`} no período (última em ${lastChange.observedAt.toISOString().slice(0, 10)}).`
					: `${path} content changed ${changes.length} time(s) in the window (last on ${lastChange.observedAt.toISOString().slice(0, 10)}).`,
			});
		} else if (dynamicPage) {
			rows.push({
				kind: "content_changed",
				path,
				weight: 4,
				observedAt: last.observedAt.toISOString().slice(0, 10),
				detail: pt
					? `${path} tem conteúdo dinâmico (muda na maior parte das verificações — banners/vitrine rotativos). Mudanças estruturais nesta página não são distinguíveis por comparação de conteúdo.`
					: `${path} has dynamic content (changes on most checks — rotating banners/grids). Structural changes on this page are not distinguishable by content comparison.`,
			});
		}

		// Latency degradation: median of first half vs second half.
		if (list.length >= 6) {
			const mid = Math.floor(list.length / 2);
			const before = median(list.slice(0, mid).map((p) => p.fetchMs));
			const after = median(list.slice(mid).map((p) => p.fetchMs));
			if (before > 0 && after >= before * SLOW_FACTOR && after >= SLOW_FLOOR_MS) {
				rows.push({
					kind: "slower",
					path,
					weight: 1,
					observedAt: last.observedAt.toISOString().slice(0, 10),
					detail: pt
						? `${path} ficou mais lenta: mediana de ${before}ms para ${after}ms no período.`
						: `${path} got slower: median ${before}ms to ${after}ms across the window.`,
				});
			}
		}
	}

	rows.sort((a, b) => a.weight - b.weight || a.path.localeCompare(b.path));

	return {
		basis: "probe_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		probedPages: byUrl.size,
		rows: rows.slice(0, MAX_ROWS),
	};
}

export async function generateWhatChanged(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<WhatChangedOutput | null> {
	// Window: since the previous plan was generated — the question the
	// section answers is literally "desde o último plano". First plan
	// falls back to 30 days.
	const windowEnd = new Date();
	let windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
	try {
		const prev = await prisma.monthlyStrategyPlan.findFirst({
			where: { environmentId: ctx.environmentId, month: { lt: ctx.month } },
			orderBy: { generatedAt: "desc" },
			select: { generatedAt: true },
		});
		if (prev?.generatedAt && prev.generatedAt < windowEnd) {
			windowStart = prev.generatedAt;
		}
	} catch {
		// keep 30d fallback
	}

	let probes: ProbeRowInput[] = [];
	try {
		probes = await prisma.pageProbe.findMany({
			where: {
				environmentId: ctx.environmentId,
				observedAt: { gte: windowStart, lt: windowEnd },
			},
			select: {
				url: true,
				statusCode: true,
				fetchMs: true,
				changedFromPrior: true,
				observedAt: true,
			},
			orderBy: { observedAt: "asc" },
			take: 5000,
		});
	} catch {
		return null;
	}

	return computeWhatChanged(probes, windowStart, windowEnd, ctx.locale ?? "pt-BR");
}
