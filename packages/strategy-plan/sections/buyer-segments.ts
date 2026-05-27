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
import type { GenerateContext, BuyerSegmentOutput } from "../types";
import { packToBuyer, BUYER_LABEL_PT_BR, type BuyerKind } from "../pack-to-buyer";

interface FindingRow {
	id: string;
	inferenceKey: string;
	pack: string;
	severity: string;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
	surface: string;
}

function titleForFinding(row: FindingRow): string {
	// Until findings carry a localized human title (Wave 22.7 — pending),
	// build a deterministic readable label from the inference key +
	// surface. The Plan UI renders this as the "Exemplos" bullet list.
	const friendlyKey = row.inferenceKey
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return `${friendlyKey} · ${row.surface}`;
}

export async function generateBuyerSegments(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<BuyerSegmentOutput[]> {
	const rows: FindingRow[] = await prisma.finding.findMany({
		where: {
			environmentId: ctx.environmentId,
			status: { in: ["created", "confirmed"] },
			statusChangedAt: { lt: ctx.monthEnd },
		},
		select: {
			id: true,
			inferenceKey: true,
			pack: true,
			severity: true,
			impactMin: true,
			impactMax: true,
			impactMidpoint: true,
			surface: true,
		},
		orderBy: { impactMidpoint: "desc" },
	});

	// Bucket findings by buyer; tally impact + collect samples.
	const buckets: Record<BuyerKind, FindingRow[]> = {
		copy: [],
		eng: [],
		leadership: [],
	};
	for (const row of rows) buckets[packToBuyer(row.pack)].push(row);

	const segments: BuyerSegmentOutput[] = (Object.keys(buckets) as BuyerKind[])
		.map((buyer) => {
			const items = buckets[buyer];
			if (items.length === 0) return null;
			const impactMin = items.reduce((a, r) => a + r.impactMin, 0);
			const impactMax = items.reduce((a, r) => a + r.impactMax, 0);
			const impactMidpoint = items.reduce((a, r) => a + r.impactMidpoint, 0);
			const sample = items.slice(0, 2);
			return {
				buyer,
				buyerLabel: BUYER_LABEL_PT_BR[buyer],
				count: items.length,
				impactMin: Math.round(impactMin),
				impactMax: Math.round(impactMax),
				impactMidpoint: Math.round(impactMidpoint),
				sampleFindingIds: sample.map((s) => s.id),
				sampleFindingTitles: sample.map(titleForFinding),
			};
		})
		.filter((s): s is BuyerSegmentOutput => s !== null);

	// Empty-env safe: if there are zero findings of any buyer, return an
	// empty array. The Plan UI renders an empty-segment state in that
	// case (Step 3 handles it).
	return segments;
}
