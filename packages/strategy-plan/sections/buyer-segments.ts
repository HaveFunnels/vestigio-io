// ──────────────────────────────────────────────
// Buyer segments generator — pure logic over findings
//
// Decomposes the month's active findings by who'd typically resolve
// them (copy / engineering / leadership) and surfaces impact range
// + 1-2 sample finding titles per segment for the card stub.
//
// Source data: Finding rows for the env, active in the requested
// month (status IN created | confirmed). Grouped via packToBuyer.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { openLossExposure, type OpenExposureRow } from "../honest-aggregates";
import type { GenerateContext, BuyerSegmentOutput } from "../types";
import { packToBuyer, buyerLabel, type BuyerKind } from "../pack-to-buyer";
import { pageEntityLabel } from "../page-label";
import { resolveInferenceTitle } from "../title-resolver";

interface FindingRow {
	inferenceKey: string;
	pack: string;
	severity: string;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
	surface: string;
}

function titleForFinding(
	row: FindingRow,
	translations: GenerateContext["translations"],
	surfaceLabel?: string | null,
): string {
	// Centralised resolver consults inference_titles + dynamic_titles +
	// root_cause_titles, including slot extraction for funnel_broken_path,
	// funnel_missing_stage, and funnel_weak_connection. Without this we'd
	// leak "Funnel Dead End Page" on havefunnels because the translation
	// lives in dynamic_titles, not inference_titles.
	const translated = resolveInferenceTitle(row.inferenceKey, translations);
	// EXAME P8 — the old fallback Title-Cased the snake key, shipping
	// "Script Supply Chain Risk" into a pt-BR plan as if it were a real
	// title. A missing translation is a bug to surface, not to disguise:
	// warn loudly and render sentence case so it still READS as a
	// fallback in review.
	if (!translated) {
		console.warn(
			`[strategy-plan] missing inference title translation: ${row.inferenceKey} — add it to dictionary/*.json engine.inference_titles`,
		);
	}
	const friendlyKey =
		translated ?? row.inferenceKey.replace(/_/g, " ");
	// ONDA 4.1 cosmetics — the entity, path demoted (EXAME v5 verdict).
	return `${friendlyKey} · ${surfaceLabel ?? row.surface}`;
}

export async function generateBuyerSegments(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<BuyerSegmentOutput[]> {
	// THE unified open-loss exposure. The per-team cards are a PARTITION
	// of the plan's one exposure total: each team's sums are scaled by
	// exposure.factor so the three cards add up to exactly the same
	// capped figure the hero, narrative and thesis show. Before this,
	// the blocks summed raw impactMidpoint with no cap — the narrative
	// would have said "at most R$ 79k" while the team cards still added
	// to R$ 305k (cross-exam round 2, hole 1).
	const exposure = await openLossExposure(prisma, ctx.environmentId, ctx.monthEnd);
	const rows: OpenExposureRow[] = exposure.rows;

	// ONDA 4.1 cosmetics — entity labels for sample titles (the cards
	// were still showing raw paths after the v5 exam).
	const labelByPath = new Map<string, string>();
	try {
		const inv = await prisma.pageInventoryItem.findMany({
			where: { environmentRef: ctx.environmentId, removedAt: null },
			select: { path: true, title: true },
			take: 500,
		});
		for (const it of inv) {
			const pp = it.path && it.path.length > 1 ? it.path.replace(/\/+$/, "") : it.path || "/";
			if (!labelByPath.has(pp)) labelByPath.set(pp, pageEntityLabel(it.title, pp, ctx.envDomain));
		}
	} catch { /* fallback: de-slugged in surfaceLabelFor */ }
	const surfaceLabelFor = (surface: string | null): string | null => {
		if (!surface) return null;
		const tok = surface.trim().split(/[,\s]+/)[0] ?? "";
		if (!tok.startsWith("/")) return null;
		const pp = tok.length > 1 ? tok.replace(/\/+$/, "") : "/";
		return labelByPath.get(pp) ?? pageEntityLabel(null, pp, ctx.envDomain);
	};

	// Bucket findings by buyer; tally impact + collect samples.
	const buckets: Record<BuyerKind, FindingRow[]> = {
		copy: [],
		eng: [],
		leadership: [],
	};
	for (const row of rows) buckets[packToBuyer(row.pack)].push(row);

	const segments: BuyerSegmentOutput[] = (Object.keys(buckets) as BuyerKind[])
		.map((buyer): BuyerSegmentOutput | null => {
			const items = buckets[buyer];
			if (items.length === 0) return null;
			const impactMin = items.reduce((a, r) => a + r.impactMin, 0) * exposure.factor;
			const impactMax = items.reduce((a, r) => a + r.impactMax, 0) * exposure.factor;
			const impactMidpoint = items.reduce((a, r) => a + r.impactMidpoint, 0) * exposure.factor;
			// Dedupe samples by their rendered title (inferenceKey+surface).
			// Without this, two highest-impact rows sharing the same
			// inferenceKey + surface produce identical bullets ("Pricing
			// Without Context · /pricing" repeated twice). After dedupe
			// we slice to 2 so the card still caps the list.
			const seenTitles = new Set<string>();
			const sample: FindingRow[] = [];
			for (const item of items) {
				const t = titleForFinding(item, ctx.translations, surfaceLabelFor(item.surface));
				if (seenTitles.has(t)) continue;
				seenTitles.add(t);
				sample.push(item);
				if (sample.length === 2) break;
			}
			return {
				buyer,
				buyerLabel: buyerLabel(buyer, ctx.locale, ctx.businessContext?.vertical ?? null),
				count: items.length,
				impactMin: Math.round(impactMin),
				impactMax: Math.round(impactMax),
				impactMidpoint: Math.round(impactMidpoint),
				// Store inferenceKey strings, not DB UUIDs. The UI drawer
				// matches against FindingProjection.inference_key (a stable
				// key) rather than the projection's deterministic id or the
				// DB row UUID. Storing UUIDs here meant the drawer never
				// matched and always rendered the empty state.
				sampleFindingIds: sample.map((s) => s.inferenceKey),
				sampleFindingTitles: sample.map((s) => titleForFinding(s, ctx.translations, surfaceLabelFor(s.surface))),
				allFindingIds: Array.from(new Set(items.map((r) => r.inferenceKey))),
			};
		})
		.filter((s): s is BuyerSegmentOutput => s !== null);

	// The team blocks are a partition of the plan's single exposure total,
	// so they must sum to it EXACTLY — the cross-exam's item (f). Scaling
	// each block by exposure.factor and rounding independently leaves a
	// few-real residual (79201 vs 79200). Push that residual onto the
	// largest block, where it is proportionally invisible, so the parts
	// add up to the headline to the last real.
	if (segments.length > 0) {
		const summed = segments.reduce((a, seg) => a + seg.impactMidpoint, 0);
		const residual = exposure.total - summed;
		if (residual !== 0) {
			const largest = segments.reduce((a, b) => (b.impactMidpoint > a.impactMidpoint ? b : a));
			largest.impactMidpoint += residual;
		}
	}

	// Empty-env safe: if there are zero findings of any buyer, return an
	// empty array. The Plan UI renders an empty-segment state in that
	// case (Step 3 handles it).
	return segments;
}
