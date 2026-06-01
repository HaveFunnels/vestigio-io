import {
	type ContentEnrichmentPayload,
	type Evidence,
	EvidenceType,
	IdGenerator,
	type Scoping,
	type Signal,
	SignalCategory,
	makeRef,
} from "../domain";
import {
	getCategoriesFor,
	type CategorySpec,
	type CustomerType,
	type SurfaceRegion,
} from "../competitive/surface-categories";
import { createSignal } from "./create";

// ──────────────────────────────────────────────
// Competitive Surface signals — Wave 26
//
// Reads ContentEnrichmentPayload evidence rows with
// enrichment_type='surface_inventory' (produced by the surface-
// inventory enricher). One row per source page (yours + each
// competitor). Computes per-category gaps:
//
//   - "Peers show category X in hero, you don't show it at all"
//   - "Peers show category X in body, you only show in footer"
//
// Emits ONE compound signal `competitive.surface_gap_detected`
// whose description carries the gap list. The inference pack reads
// it and renders the reasoning per business model — the specific
// categories named in the description ARE the business-model-aware
// payload, because the category list itself was customer-type aware.
//
// Threshold: a category is "gap" when ≥50% of peers show it AND
// you don't show it (or show it only in body/footer when peers
// show in header/hero). Weighted by CategorySpec.weight so high-
// impact gaps (frete grátis, transformation_promise, address_visibility)
// land first.
// ──────────────────────────────────────────────

const GAP_PEER_RATIO_THRESHOLD = 0.5; // ≥50% of peers must show

type Region = SurfaceRegion | "unknown";

interface InventoryItem {
	category_key: string;
	presence: boolean;
	region: Region;
	extracted_text: string;
	confidence: number;
}

interface PageInventory {
	source: "self" | "competitor";
	source_label: string;
	source_url: string;
	customer_type: CustomerType;
	items: InventoryItem[];
}

function regionRank(r: Region): number {
	// Higher = more prominent. "header" and "hero" are roughly
	// equivalent for above-the-fold expectation.
	switch (r) {
		case "header":
			return 4;
		case "hero":
			return 4;
		case "body":
			return 2;
		case "footer":
			return 1;
		case "unknown":
		default:
			return 0;
	}
}

function readInventories(byType: Map<EvidenceType, Evidence[]>): PageInventory[] {
	const enrichments = byType.get(EvidenceType.ContentEnrichment) || [];
	const out: PageInventory[] = [];
	for (const ev of enrichments) {
		const p = ev.payload as ContentEnrichmentPayload;
		if (p.enrichment_type !== "surface_inventory") continue;
		const results = p.results as {
			source?: "self" | "competitor";
			source_label?: string;
			customer_type?: CustomerType;
			items?: InventoryItem[];
		};
		if (
			!results ||
			!results.source ||
			!results.customer_type ||
			!Array.isArray(results.items)
		)
			continue;
		out.push({
			source: results.source,
			source_label: results.source_label || "(unknown)",
			source_url: p.source_url,
			customer_type: results.customer_type,
			items: results.items,
		});
	}
	return out;
}

interface CategoryGap {
	key: string;
	label: string;
	weight: number;
	peer_present_count: number;
	peer_total: number;
	own_present: boolean;
	own_region: Region;
	expected_region: SurfaceRegion;
	peer_examples: string[]; // 1-3 extracted_text samples
	weighted_score: number; // gap magnitude × category weight
}

function computeGaps(inventories: PageInventory[]): CategoryGap[] {
	const own = inventories.find((i) => i.source === "self");
	const peers = inventories.filter((i) => i.source === "competitor");
	if (peers.length === 0) return [];

	const customerType: CustomerType = own?.customer_type || peers[0].customer_type;
	const categories = getCategoriesFor(customerType);
	const categoryByKey = new Map<string, CategorySpec>(
		categories.map((c) => [c.key, c]),
	);

	const ownByKey = new Map<string, InventoryItem>();
	if (own) for (const it of own.items) ownByKey.set(it.category_key, it);

	const gaps: CategoryGap[] = [];
	for (const cat of categories) {
		// Peer stats for this category
		let peerPresent = 0;
		const peerExamples: string[] = [];
		let peerProminentCount = 0;
		for (const peer of peers) {
			const item = peer.items.find((i) => i.category_key === cat.key);
			if (!item) continue;
			if (item.presence) {
				peerPresent++;
				if (
					regionRank(item.region) >=
					regionRank(cat.expected_region || "hero")
				) {
					peerProminentCount++;
				}
				if (item.extracted_text.length > 0 && peerExamples.length < 3) {
					peerExamples.push(item.extracted_text);
				}
			}
		}
		const ratio = peerPresent / peers.length;
		if (ratio < GAP_PEER_RATIO_THRESHOLD) continue;

		const ownItem = ownByKey.get(cat.key);
		const ownPresent = !!ownItem?.presence;
		const ownRegion: Region = ownItem?.region ?? "unknown";

		// Gap exists if EITHER:
		//  (a) you don't have it at all, or
		//  (b) peers show it prominently and you don't.
		const expected = cat.expected_region || "hero";
		const peersAreProminent =
			peerProminentCount / Math.max(1, peerPresent) >= 0.5;
		const ownIsProminent = regionRank(ownRegion) >= regionRank(expected);
		if (ownPresent && (!peersAreProminent || ownIsProminent)) continue;

		const magnitude = !ownPresent ? 1.0 : 0.5; // missing entirely > present-but-buried
		gaps.push({
			key: cat.key,
			label: cat.label_pt,
			weight: cat.weight,
			peer_present_count: peerPresent,
			peer_total: peers.length,
			own_present: ownPresent,
			own_region: ownRegion,
			expected_region: expected,
			peer_examples: peerExamples,
			weighted_score: magnitude * cat.weight,
		});
	}

	gaps.sort((a, b) => b.weighted_score - a.weighted_score);
	return gaps;
}

export function extractCompetitiveSurfaceSignals(
	byType: Map<EvidenceType, Evidence[]>,
	scoping: Scoping,
	cycle_ref: string,
	signals: Signal[],
	ids: IdGenerator,
): void {
	const inventories = readInventories(byType);
	if (inventories.length === 0) return;
	const gaps = computeGaps(inventories);
	if (gaps.length === 0) return;

	const top = gaps[0];
	const topGaps = gaps.slice(0, 5);
	const customerType =
		inventories.find((i) => i.source === "self")?.customer_type ||
		inventories[0].customer_type;

	// Description packs the structured gap list as a compact string —
	// the pack's reasoning parses it back into a per-category bullet.
	// Format: "<count> gaps (type=<ct>) | <key>:<peer_ratio>:<own_state>:<example1> | ..."
	const ownState = (g: CategoryGap): string =>
		!g.own_present
			? "ausente"
			: `presente em ${g.own_region}`;
	const descParts = topGaps.map((g) => {
		const example = g.peer_examples[0] || "";
		const trimmedExample = example.length > 60 ? example.slice(0, 57) + "…" : example;
		return `${g.label}: ${g.peer_present_count}/${g.peer_total} peers • você: ${ownState(g)} • ex.: "${trimmedExample}"`;
	});
	const description = `tipo=${customerType} | ${descParts.join(" | ")}`.slice(
		0,
		950,
	);

	// All evidence_refs of the inventory rows that fed this signal —
	// the verification path can re-render the per-category panel.
	const evidence_refs: string[] = [];
	const enrichments = byType.get(EvidenceType.ContentEnrichment) || [];
	for (const ev of enrichments) {
		const p = ev.payload as ContentEnrichmentPayload;
		if (p.enrichment_type === "surface_inventory") {
			evidence_refs.push(makeRef("evidence", ev.id));
		}
	}

	const totalWeightedGap = topGaps.reduce((sum, g) => sum + g.weighted_score, 0);
	signals.push({
		...createSignal({
			signal_key: "competitive.surface_gap_detected",
			attribute: "competitive.surface.gap_count",
			value: String(gaps.length),
			numeric_value: Math.round(totalWeightedGap * 100),
			category: SignalCategory.Competitive,
			confidence: 85,
			scoping,
			cycle_ref,
			ids,
			evidence_refs,
			description,
		}),
		subject_label: top.label,
	});
}

export const __testing = {
	readInventories,
	computeGaps,
	regionRank,
};
