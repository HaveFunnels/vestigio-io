// ──────────────────────────────────────────────
// Wave 22.8.2 — Competitor Radar section generator
//
// Sources:
//   1. CompetitorDomain rows for the env (curated list, manual + auto)
//   2. Finding rows with the competitive-lens pack inferenceKeys:
//      - copy_mirror_detected      (per-domain: top mirroring competitor)
//      - trust_posture_lag         (peer-set wide)
//      - brand_serp_encroachment   (per-domain: who ranks on your brand)
//      - serp_overlap_detected     (peer-set wide)
//
// The plan generator already filters Finding rows by env + status; we
// constrain further by inferenceKey IN (...). We do NOT scope by
// cycleId because competitive findings update across cycles and the
// current month plan wants the latest active state.
//
// Returns null only when BOTH conditions hold:
//   - zero curated competitors (totalMonitored === 0)
//   - zero competitive findings
// Otherwise renders the section even in monitoring-only mode (curated
// competitors with no signals yet) so the customer sees their list.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	GenerateContext,
	CompetitorSectionOutput,
	CompetitorEntryOutput,
	CompetitorPeerSignalOutput,
} from "../types";

const COMPETITIVE_INFERENCE_KEYS = [
	"copy_mirror_detected",
	"trust_posture_lag",
	"brand_serp_encroachment",
	"serp_overlap_detected",
];

type Severity = "low" | "medium" | "high";

function normaliseSeverity(raw: string | null | undefined): Severity {
	const s = (raw ?? "").toLowerCase();
	if (s === "high" || s === "critical") return "high";
	if (s === "medium") return "medium";
	return "low";
}

function trimSummary(text: string | null | undefined, max = 280): string {
	if (!text) return "";
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max - 1).trimEnd()}…`;
}

// ── Wave 23.1 — trend signal helpers ─────────────────────────
//
// Quatro detecções cross-cycle a partir de CompetitorDeepSnapshot:
//
//   1. price_increase — tier mais barato subiu >5% vs ciclo anterior
//      (com mesma currency + interval). Severity por % de aumento.
//
//   2. dropped_free_tier — hasFreeTier era true, virou false.
//      Sempre high (free→paid é movimento estratégico raro).
//
//   3. content_acceleration — blog_post_count >2x previous (mínimo 3 no
//      previous pra evitar ruído de baseline pequena). Severity por
//      multiplier.
//
//   4. content_silence — latest_post_date > 60 dias atrás. Severity por
//      idade.
//
// Detecção é defensiva: silenciosa em qualquer mismatch de unidades
// (currency change, interval change). Trend sem comparável = sem signal.

interface DeepSnapshotForTrend {
	pricing_tiers: Array<{
		amount: number | null;
		currency: string | null;
		interval: "month" | "year" | "one_time" | null;
	}>;
	has_free_tier: boolean;
	tier_count: number;
	blog_post_count: number | null;
	blog_latest_post_date: string | null;
}

function findCheapestPaidTier(
	tiers: DeepSnapshotForTrend["pricing_tiers"],
): { amount: number; currency: string; interval: string } | null {
	const valid = tiers
		.filter((t) => t.amount != null && t.amount > 0 && t.currency && t.interval)
		.sort((a, b) => a.amount! - b.amount!);
	const cheapest = valid[0];
	if (!cheapest) return null;
	return {
		amount: cheapest.amount!,
		currency: cheapest.currency!,
		interval: cheapest.interval!,
	};
}

function fmtBrl(amount: number, currency: string): string {
	const symbol =
		currency === "BRL" ? "R$ " :
		currency === "EUR" ? "€" :
		currency === "GBP" ? "£" : "$";
	return `${symbol}${Math.round(amount)}`;
}

function computeTrendSignals(
	current: DeepSnapshotForTrend,
	previous: DeepSnapshotForTrend | null,
	now: Date,
): Array<{
	kind:
		| "price_increase"
		| "dropped_free_tier"
		| "content_acceleration"
		| "content_silence";
	severity: "low" | "medium" | "high";
	detail: string;
}> {
	const signals: Array<{
		kind:
			| "price_increase"
			| "dropped_free_tier"
			| "content_acceleration"
			| "content_silence";
		severity: "low" | "medium" | "high";
		detail: string;
	}> = [];

	// 1 + 2 — pricing trends (precisa de previous)
	if (previous) {
		const curCheapest = findCheapestPaidTier(current.pricing_tiers);
		const prevCheapest = findCheapestPaidTier(previous.pricing_tiers);

		// price_increase: mesma currency + interval, current > previous +5%
		if (
			curCheapest &&
			prevCheapest &&
			curCheapest.currency === prevCheapest.currency &&
			curCheapest.interval === prevCheapest.interval &&
			curCheapest.amount > prevCheapest.amount * 1.05
		) {
			const pct = Math.round(
				((curCheapest.amount - prevCheapest.amount) / prevCheapest.amount) * 100,
			);
			const severity: "low" | "medium" | "high" =
				pct >= 25 ? "high" : pct >= 10 ? "medium" : "low";
			signals.push({
				kind: "price_increase",
				severity,
				detail: `Tier mais barato subiu de ${fmtBrl(prevCheapest.amount, prevCheapest.currency)} pra ${fmtBrl(curCheapest.amount, curCheapest.currency)} (+${pct}%).`,
			});
		}

		// dropped_free_tier: tinha free, perdeu
		if (previous.has_free_tier && !current.has_free_tier) {
			signals.push({
				kind: "dropped_free_tier",
				severity: "high",
				detail: "Removeu o tier gratuito. Sinal forte de movimento de monetização. Janela pra customers expostos.",
			});
		}
	}

	// 3 — content_acceleration: posts >2x previous (e previous >= 3 pra
	//     evitar baseline ruidosa do tipo 1→3 = "acelerou 3x")
	if (
		previous &&
		current.blog_post_count != null &&
		previous.blog_post_count != null &&
		previous.blog_post_count >= 3 &&
		current.blog_post_count > previous.blog_post_count * 2
	) {
		const multiplier = (current.blog_post_count / previous.blog_post_count).toFixed(1);
		const severity: "low" | "medium" | "high" =
			current.blog_post_count > previous.blog_post_count * 3 ? "high" : "medium";
		signals.push({
			kind: "content_acceleration",
			severity,
			detail: `Acelerou conteúdo ${multiplier}x. Passou de ${previous.blog_post_count} pra ${current.blog_post_count} posts no blog.`,
		});
	}

	// 4 — content_silence: latest post >60 dias atrás
	if (current.blog_latest_post_date) {
		try {
			const latest = new Date(current.blog_latest_post_date);
			const ageDays = Math.floor((now.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
			if (ageDays >= 60) {
				const severity: "low" | "medium" | "high" =
					ageDays >= 120 ? "high" : "medium";
				signals.push({
					kind: "content_silence",
					severity,
					detail: `Sem post novo há ${ageDays} dias. Investimento em conteúdo desacelerou.`,
				});
			}
		} catch {
			// Data malformada — skip silenciosamente.
		}
	}

	return signals;
}

/**
 * Try to extract the competitor domain a per-domain Finding is about.
 * The competitive-lens pack sets it in the engine signal_refs/reasoning;
 * the persisted Finding row carries it in the projection JSON as
 * `subject_label` (mirrors Signal.subject_label).
 *
 * Falls back to scanning rootCause text for known competitor domains
 * when the projection has no subject. The Finding-to-competitor binding
 * is best-effort by design; missing it just means the signal renders
 * as a peer-set entry instead of attached to one competitor.
 */
function extractSubject(
	projectionRaw: string | null,
	knownDomains: string[],
	rootCause: string | null,
): string | null {
	if (projectionRaw) {
		try {
			const proj = JSON.parse(projectionRaw) as { subject_label?: string };
			if (proj.subject_label && proj.subject_label.length > 0) {
				return proj.subject_label.toLowerCase();
			}
		} catch {
			// Malformed projection blob — keep going.
		}
	}
	// Heuristic scan: which curated competitor is mentioned in rootCause?
	if (rootCause) {
		const lower = rootCause.toLowerCase();
		for (const d of knownDomains) {
			if (lower.includes(d)) return d;
		}
	}
	return null;
}

export async function generateCompetitorRadar(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<CompetitorSectionOutput | null> {
	// 1. Curated competitors for the env.
	const curated = await prisma.competitorDomain.findMany({
		where: { environmentId: ctx.environmentId },
		select: {
			domain: true,
			label: true,
			active: true,
			discoveryMethod: true,
		},
		orderBy: [{ active: "desc" }, { addedAt: "desc" }],
	});
	const totalMonitored = curated.length;
	const activeCurated = curated.filter((c) => c.active);
	const totalActive = activeCurated.length;

	// 2. Competitive findings (active state, latest write per inference
	//    key per cycle wins because we order by createdAt desc and dedupe
	//    by inferenceKey + subject below).
	const findings = await prisma.finding.findMany({
		where: {
			environmentId: ctx.environmentId,
			inferenceKey: { in: COMPETITIVE_INFERENCE_KEYS },
			status: { in: ["created", "confirmed"] },
			statusChangedAt: { lt: ctx.monthEnd },
		},
		select: {
			inferenceKey: true,
			severity: true,
			rootCause: true,
			cycleId: true,
			projection: true,
			createdAt: true,
		},
		orderBy: { createdAt: "desc" },
	});

	// Self-hide guard: nothing curated AND no findings = hide entirely.
	if (totalMonitored === 0 && findings.length === 0) {
		return null;
	}

	const activeDomains = activeCurated.map((c) => c.domain.toLowerCase());
	const cycleId = findings[0]?.cycleId ?? null;

	// 3. Peer-set-wide signals (only the most recent of each type wins).
	let trustPostureLag: CompetitorPeerSignalOutput | null = null;
	let serpOverlap: CompetitorPeerSignalOutput | null = null;
	for (const f of findings) {
		if (f.inferenceKey === "trust_posture_lag" && !trustPostureLag) {
			trustPostureLag = {
				severity: normaliseSeverity(f.severity),
				summary: trimSummary(f.rootCause),
			};
		}
		if (f.inferenceKey === "serp_overlap_detected" && !serpOverlap) {
			serpOverlap = {
				severity: normaliseSeverity(f.severity),
				summary: trimSummary(f.rootCause),
			};
		}
		if (trustPostureLag && serpOverlap) break;
	}

	// 4. Per-competitor entries — start from curated list, then attach
	//    signals when subject extraction binds them.
	const entriesByDomain = new Map<string, CompetitorEntryOutput>();
	for (const c of activeCurated) {
		const domain = c.domain.toLowerCase();
		entriesByDomain.set(domain, {
			domain: c.domain,
			label: c.label,
			discoveryMethod: c.discoveryMethod,
			signals: [],
		});
	}

	for (const f of findings) {
		if (
			f.inferenceKey !== "copy_mirror_detected" &&
			f.inferenceKey !== "brand_serp_encroachment"
		) {
			continue;
		}
		const subject = extractSubject(f.projection, activeDomains, f.rootCause);
		if (!subject) continue;
		const entry = entriesByDomain.get(subject);
		if (!entry) continue;
		// Dedupe: at most one signal per (entry, kind). Engine emits one
		// canonical Finding per inferenceKey; if multiple cycles repeat
		// the same key we want the latest only (findings are already
		// ordered by createdAt desc).
		const kind: "copy_mirror" | "serp_encroachment" =
			f.inferenceKey === "copy_mirror_detected" ? "copy_mirror" : "serp_encroachment";
		if (entry.signals.some((s) => s.kind === kind)) continue;
		entry.signals.push({
			kind,
			severity: normaliseSeverity(f.severity),
			detail: trimSummary(f.rootCause, 200),
		});
	}

	// 5. Wave 23 P0.2 + P1.2 — attach deep snapshot (pricing tiers +
	// blog content velocity) por competitor. Lê CompetitorDeepSnapshot
	// evidence, mais recente por (env, competitor_domain) ganha. Atacha
	// no entries antes do sort.
	//
	// Wave 23.1 — cross-cycle trend detection. Segunda-mais-recente
	// snapshot por competitor é guardada como `previous` pra computar
	// 4 trends inline (não passa pelo signal engine porque o engine
	// trabalha within-cycle; essas comparações são cross-cycle):
	//   - price_increase       (cheapest tier subiu >5%)
	//   - dropped_free_tier    (free tier sumiu)
	//   - content_acceleration (blog posts >2x previous)
	//   - content_silence      (latest post >60d)
	const deepEvidence = await prisma.evidence.findMany({
		where: {
			environmentRef: ctx.environmentId,
			evidenceType: "competitor_deep_snapshot",
		},
		select: { payload: true, observedAt: true },
		orderBy: { observedAt: "desc" },
	});

	interface DeepSnapshot {
		pricing_tiers: Array<{
			label: string | null;
			amount: number | null;
			currency: string | null;
			interval: "month" | "year" | "one_time" | null;
		}>;
		has_free_tier: boolean;
		tier_count: number;
		pricing_url: string | null;
		blog_post_count: number | null;
		blog_latest_post_date: string | null;
		blog_url: string | null;
		observed_at: Date;
	}

	// Guarda current + previous por competitor pra trend comparison.
	const snapshotsByDomain = new Map<string, DeepSnapshot[]>();
	for (const ev of deepEvidence) {
		try {
			const p = JSON.parse(ev.payload) as {
				competitor_domain: string;
				pricing_tiers: DeepSnapshot["pricing_tiers"];
				has_free_tier: boolean;
				tier_count: number;
				pricing_url: string | null;
				blog_post_count: number | null;
				blog_latest_post_date: string | null;
				blog_url: string | null;
			};
			const key = p.competitor_domain.toLowerCase();
			const list = snapshotsByDomain.get(key) ?? [];
			if (list.length >= 2) continue; // só precisamos do current + previous
			list.push({
				pricing_tiers: p.pricing_tiers ?? [],
				has_free_tier: !!p.has_free_tier,
				tier_count: p.tier_count ?? 0,
				pricing_url: p.pricing_url,
				blog_post_count: p.blog_post_count,
				blog_latest_post_date: p.blog_latest_post_date,
				blog_url: p.blog_url,
				observed_at: ev.observedAt,
			});
			snapshotsByDomain.set(key, list);
		} catch {
			// Malformed payload — skip.
		}
	}

	for (const entry of entriesByDomain.values()) {
		const key = entry.domain.toLowerCase();
		const list = snapshotsByDomain.get(key);
		if (!list || list.length === 0) continue;
		const current = list[0];
		entry.deepSnapshot = {
			pricingTiers: current.pricing_tiers,
			hasFreeTier: current.has_free_tier,
			tierCount: current.tier_count,
			pricingUrl: current.pricing_url,
			blogPostCount: current.blog_post_count,
			blogLatestPostDate: current.blog_latest_post_date,
			blogUrl: current.blog_url,
		};

		// Trend signals — só fire quando tem previous (>= 2 snapshots).
		const previous = list[1] ?? null;
		const now = new Date();
		const trendSignals = computeTrendSignals(current, previous, now);
		for (const s of trendSignals) {
			// Dedupe contra signals já existentes (ex: copy_mirror,
			// serp_encroachment vindas de findings) por kind.
			if (entry.signals.some((existing) => existing.kind === s.kind)) continue;
			entry.signals.push(s);
		}
	}

	// Sort signals dentro de cada entry: severity desc (high → low), depois
	// alphabetical por kind pra estabilidade visual. Garante que o chip
	// mais grave aparece primeiro no row do concorrente.
	const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
	for (const entry of entriesByDomain.values()) {
		entry.signals.sort((a, b) => {
			const ds = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
			if (ds !== 0) return ds;
			return a.kind.localeCompare(b.kind);
		});
	}

	const entries = Array.from(entriesByDomain.values()).sort((a, b) => {
		const dt = b.signals.length - a.signals.length;
		if (dt !== 0) return dt;
		return a.domain.localeCompare(b.domain);
	});

	return {
		cycleId,
		totalMonitored,
		totalActive,
		withSignalsCount: entries.filter((e) => e.signals.length > 0).length,
		trustPostureLag,
		serpOverlap,
		entries,
	};
}
