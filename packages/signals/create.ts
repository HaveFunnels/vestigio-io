import {
	FreshnessState,
	IdGenerator,
	Scoping,
	Signal,
	SignalCategory,
} from "../domain";

// ──────────────────────────────────────────────
// createSignal helper — shared by the legacy engine.ts (which has its
// own copy for historical reasons) and any new signal-extractor module
// (e.g. off-site-recon-signals.ts). Both implementations are
// behaviorally identical; this file exists so new modules don't need
// to either re-implement the helper or import a private from engine.ts.
// ──────────────────────────────────────────────

export function createSignal(params: {
	signal_key: string;
	category: SignalCategory;
	attribute: string;
	value: string;
	numeric_value?: number | null;
	confidence: number;
	scoping: Scoping;
	cycle_ref: string;
	evidence_refs: string[];
	description: string;
	ids: IdGenerator;
}): Signal {
	const now = new Date();
	return {
		id: params.ids.next(),
		signal_key: params.signal_key,
		category: params.category,
		scoping: params.scoping,
		cycle_ref: params.cycle_ref,
		freshness: {
			observed_at: now,
			fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
			freshness_state: FreshnessState.Fresh,
			staleness_reason: null,
		},
		attribute: params.attribute,
		value: params.value,
		numeric_value: params.numeric_value ?? null,
		confidence: params.confidence,
		evidence_refs: params.evidence_refs,
		subject_label: null,
		description: params.description,
		created_at: now,
		updated_at: now,
	};
}
