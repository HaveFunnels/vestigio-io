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
	const deepEvidence = await prisma.evidence.findMany({
		where: {
			environmentRef: ctx.environmentId,
			evidenceType: "competitor_deep_snapshot",
		},
		select: { payload: true, observedAt: true },
		orderBy: { observedAt: "desc" },
	});
	const deepByDomain = new Map<string, CompetitorEntryOutput["deepSnapshot"]>();
	for (const ev of deepEvidence) {
		try {
			const p = JSON.parse(ev.payload) as {
				competitor_domain: string;
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
			};
			const key = p.competitor_domain.toLowerCase();
			if (deepByDomain.has(key)) continue; // mais recente já anotada
			deepByDomain.set(key, {
				pricingTiers: p.pricing_tiers ?? [],
				hasFreeTier: !!p.has_free_tier,
				tierCount: p.tier_count ?? 0,
				pricingUrl: p.pricing_url,
				blogPostCount: p.blog_post_count,
				blogLatestPostDate: p.blog_latest_post_date,
				blogUrl: p.blog_url,
			});
		} catch {
			// Malformed payload — skip.
		}
	}
	for (const entry of entriesByDomain.values()) {
		const deep = deepByDomain.get(entry.domain.toLowerCase());
		if (deep) entry.deepSnapshot = deep;
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
