import {
	type CustomerVoiceSnapshotPayload,
	type Evidence,
	EvidenceType,
	IdGenerator,
	type Scoping,
	type Signal,
	SignalCategory,
	makeRef,
} from "../domain";
import { createSignal } from "./create";

// ──────────────────────────────────────────────
// Competitive Voice signals — Wave 27 (Reclame Aqui)
//
// Reads CustomerVoiceSnapshot evidence rows and emits ONE compound
// signal `competitive.customer_voice_delta` when there's a material
// gap between your reputation/resolution and the peer set's median.
//
// Two axes that matter:
//
//   1. Reputation label delta — Reclame Aqui's badge ('RA1000',
//      'Ótimo', 'Bom', 'Regular', 'Ruim', 'Não recomendada'). Mapped
//      to a 0-100 score so we can compute medians. A "Ruim" you vs
//      "Bom" peer median = clear gap.
//
//   2. Resolution index delta — RA's "Índice de Solução" 0-10 scale.
//      Quantitative, comparable across brands. Delta ≥1.0 point is
//      material; ≥2.0 is severe.
//
// Aggregation requires ≥2 peers with `listed=true` to compute a
// meaningful peer median. If you're not even listed on RA, that's
// itself a notable signal — but Wave 27 ships only the "delta vs
// peers" angle; the "you're not even listed" angle is deferred (an
// owner who isn't listed on RA usually knows that already).
// ──────────────────────────────────────────────

const REPUTATION_TO_SCORE: Record<string, number> = {
	RA1000: 95,
	Ótimo: 85,
	Bom: 70,
	Regular: 50,
	Ruim: 30,
	"Não recomendada": 10,
	"Sem reputação": 40, // present but no enough volume — neutral mid-low
};

const REPUTATION_GAP_THRESHOLD = 15; // points (0-100 scale)
const RESOLUTION_GAP_THRESHOLD = 1.0; // points (0-10 scale)

function reputationToScore(label: string | null): number | null {
	if (!label) return null;
	const score = REPUTATION_TO_SCORE[label];
	return typeof score === "number" ? score : null;
}

function median(arr: number[]): number {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
		: sorted[mid];
}

function readSnapshots(byType: Map<EvidenceType, Evidence[]>): Array<{
	source_label: string;
	payload: CustomerVoiceSnapshotPayload;
	evidence_ref: string;
}> {
	const evs = byType.get(EvidenceType.CustomerVoiceSnapshot) || [];
	const out: Array<{
		source_label: string;
		payload: CustomerVoiceSnapshotPayload;
		evidence_ref: string;
	}> = [];
	for (const ev of evs) {
		const p = ev.payload as CustomerVoiceSnapshotPayload;
		if (p.type !== "customer_voice_snapshot") continue;
		out.push({
			source_label: p.source_label,
			payload: p,
			evidence_ref: makeRef("evidence", ev.id),
		});
	}
	return out;
}

export function extractCompetitiveVoiceSignals(
	byType: Map<EvidenceType, Evidence[]>,
	scoping: Scoping,
	cycle_ref: string,
	signals: Signal[],
	ids: IdGenerator,
): void {
	const snapshots = readSnapshots(byType);
	if (snapshots.length === 0) return;

	const own = snapshots.find((s) => s.source_label === "self");
	const peers = snapshots.filter(
		(s) => s.source_label.startsWith("competitor:") && s.payload.listed,
	);

	// Need own listed + at least 2 listed peers to compute meaningful
	// medians. With 1 peer, "median" is just that peer — too noisy.
	if (!own || !own.payload.listed) return;
	if (peers.length < 2) return;

	const ownRepScore = reputationToScore(own.payload.reputation_label);
	const ownResolution = own.payload.resolution_index;
	const peerRepScores = peers
		.map((p) => reputationToScore(p.payload.reputation_label))
		.filter((s): s is number => s !== null);
	const peerResolutions = peers
		.map((p) => p.payload.resolution_index)
		.filter((r): r is number => r !== null);

	// At least one axis must have own + ≥2 peer values
	const repAxisOk = ownRepScore !== null && peerRepScores.length >= 2;
	const resAxisOk = ownResolution !== null && peerResolutions.length >= 2;
	if (!repAxisOk && !resAxisOk) return;

	const repDelta = repAxisOk
		? Math.round(median(peerRepScores) - (ownRepScore as number))
		: 0;
	const resDelta = resAxisOk
		? Math.round((median(peerResolutions) - (ownResolution as number)) * 10) / 10
		: 0;

	const repGapMaterial = repAxisOk && repDelta >= REPUTATION_GAP_THRESHOLD;
	const resGapMaterial = resAxisOk && resDelta >= RESOLUTION_GAP_THRESHOLD;
	if (!repGapMaterial && !resGapMaterial) return;

	// Severity scales with magnitude of the worse-performing axis.
	const repBucket =
		repDelta >= 35 ? "severo" : repDelta >= 20 ? "moderado" : "leve";
	const resBucket =
		resDelta >= 2.5 ? "severo" : resDelta >= 1.5 ? "moderado" : "leve";
	const bucket =
		repBucket === "severo" || resBucket === "severo"
			? "severo"
			: repBucket === "moderado" || resBucket === "moderado"
				? "moderado"
				: "leve";

	const ownLabel = own.payload.reputation_label || "?";
	const ownIdx = ownResolution !== null ? ownResolution.toFixed(1) : "?";
	const peerRepMedianLabel = (() => {
		if (peerRepScores.length === 0) return "?";
		const med = median(peerRepScores);
		// Map back to closest label for display
		const closest = Object.entries(REPUTATION_TO_SCORE).reduce(
			(best, [lbl, s]) =>
				Math.abs(s - med) < Math.abs(REPUTATION_TO_SCORE[best] - med)
					? lbl
					: best,
			"Bom",
		);
		return closest;
	})();
	const peerResMedian = peerResolutions.length > 0 ? median(peerResolutions) : null;

	const description = `Reputação: você "${ownLabel}" (${ownRepScore ?? "?"}) vs mediana peers "${peerRepMedianLabel}" (Δ ${repDelta}) | Índice solução: você ${ownIdx} vs mediana peers ${peerResMedian !== null ? peerResMedian.toFixed(1) : "?"} (Δ ${resDelta.toFixed(1)}) | ${peers.length} peers analisados`;

	const evidence_refs = [
		own.evidence_ref,
		...peers.map((p) => p.evidence_ref),
	];

	// Numeric value packs both deltas as composite: 0-200 scale where
	// rep_delta × 1 + res_delta × 10 (so a 1.0 resolution gap ~= 10 rep
	// pts of weight). Used by the inference for severity banding.
	const compositeMagnitude = Math.round(
		Math.max(0, repDelta) + Math.max(0, resDelta) * 10,
	);

	signals.push({
		...createSignal({
			signal_key: "competitive.customer_voice_delta",
			attribute: "competitive.customer_voice.delta",
			value: bucket,
			numeric_value: compositeMagnitude,
			category: SignalCategory.Competitive,
			confidence: 80,
			scoping,
			cycle_ref,
			ids,
			evidence_refs,
			description: description.slice(0, 480),
		}),
		subject_label: "Reclame Aqui",
	});
}

export const __testing = {
	reputationToScore,
	median,
	readSnapshots,
};
