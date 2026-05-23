import {
	aggregateSurfaceKind,
	parseRef,
	SurfaceKind,
} from "../domain";
import type { Inference, Signal } from "../domain";

// ──────────────────────────────────────────────
// Inference surface_kind stamping — Wave 22.5
//
// Each inference cites a list of signal_refs. After all pack functions
// produce their inferences, we stamp surface_kind on the inference by
// aggregating the surface_kinds of the signals it cites.
//
// The aggregation rules (aggregateSurfaceKind in packages/domain):
//   - Any Mixed signal → inference is Mixed.
//   - All signals agree on a single kind → inference is that kind.
//   - Signals split between Public + Authenticated → inference is Mixed.
//   - Otherwise → Public (Unknown rolls up to Public via
//     effectiveSurfaceKind).
//
// Compound inferences that NEED both surfaces (e.g.
// landing_app_mismatch comparing landing-page promise vs app reality)
// naturally end up as Mixed because they cite signals from both. That
// matches the pack-manifest concept in Tier 2 — these inferences
// declare accepted_surfaces=['mixed'] and are gated structurally.
// ──────────────────────────────────────────────

export function stampInferenceSurfaceKinds(
	inferences: readonly Inference[],
	signals: readonly Signal[],
): Inference[] {
	// Index signals by id for O(1) per-ref lookup. Inferences typically
	// cite 2-6 signals each; building the index up front beats walking
	// the full signal list per inference.
	const signalIndex = new Map<string, Signal>();
	for (const s of signals) signalIndex.set(s.id, s);

	return inferences.map((inf) => {
		// Per-inference surface_kind: aggregate surface across cited
		// signals. Preserve any explicit value already on the inference
		// (some inference rules know their surface a priori, e.g.
		// authenticated-only rules).
		if (inf.scoping.surface_kind) return inf;

		const kinds: (SurfaceKind | undefined)[] = [];
		for (const ref of inf.signal_refs) {
			try {
				const { id } = parseRef(ref);
				const sig = signalIndex.get(id);
				if (sig) kinds.push(sig.scoping.surface_kind);
			} catch {
				// Bad ref — ignore.
			}
		}

		const aggregated = aggregateSurfaceKind(kinds);

		return {
			...inf,
			scoping: {
				...inf.scoping,
				surface_kind: aggregated,
			},
		};
	});
}
