import {
	FreshnessState,
	IdGenerator,
	Scoping,
	Signal,
	SignalCategory,
} from "../domain";

// ──────────────────────────────────────────────
// createSignal — THE canonical Signal factory (Wave 20.3).
//
// Previously triple-implemented: this file's export, a copy in
// packages/signals/engine.ts:5710 ("historical reasons"), and a copy
// in workers/ingestion/stages/static-checks.ts:822 ("local helper").
// All three were behaviorally identical. The two copies were removed
// in Wave 20.3 and now import from here. New signal-extractor
// modules MUST import from here — no new local copies.
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
