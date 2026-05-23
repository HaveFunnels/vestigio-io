import {
	aggregateSurfaceKind,
	buildEvidenceSurfaceIndex,
	parseRef,
	SurfaceKind,
} from "../domain";
import type { Evidence, Signal } from "../domain";

// ──────────────────────────────────────────────
// Signal surface_kind stamping — Wave 22.5
//
// Post-extraction pass that derives surface_kind for each signal from
// its backing evidence and stamps it onto the signal's scoping.
//
// Why a post-pass instead of touching each extractor:
//   - There are 15+ signal extractors across packages/signals/ and
//     workers/ingestion/stages/. Threading the surface_kind argument
//     through every call site is a massive surface-area change and
//     produces merge conflicts with every concurrent edit.
//   - Each extractor's input — the Evidence array — already carries
//     enough information to infer surface_kind via
//     inferEvidenceSurfaceKind. We just need to look up the evidence
//     each signal cites and aggregate.
//   - Extractors that DO know the surface (saas-signals stamps
//     Authenticated explicitly) win because their existing
//     surface_kind is preserved — this pass only fills in the gaps.
// ──────────────────────────────────────────────

export interface StampOptions {
	/**
	 * When true, signals that already carry surface_kind are left alone.
	 * Default: true (extractor-provided surface_kind wins over inferred).
	 */
	preserveExisting?: boolean;
}

/**
 * Stamp surface_kind on every signal in the array, based on the
 * surface of the evidence each signal cites. Returns a NEW signal
 * array (immutable input). The evidence index can be reused across
 * multiple stamping passes — build once per recompute cycle.
 */
export function stampSignalSurfaceKinds(
	signals: readonly Signal[],
	evidence: readonly Evidence[],
	options: StampOptions = {},
): Signal[] {
	const evidenceIndex = buildEvidenceSurfaceIndex(evidence);
	const preserveExisting = options.preserveExisting ?? true;

	return signals.map((sig) => {
		if (preserveExisting && sig.scoping.surface_kind) {
			return sig;
		}

		const surfaceKinds: SurfaceKind[] = [];
		for (const ref of sig.evidence_refs) {
			try {
				const { id } = parseRef(ref);
				const kind = evidenceIndex.get(id);
				if (kind) surfaceKinds.push(kind);
			} catch {
				// Bad ref format — ignore and fall through to the
				// aggregation default (Public).
			}
		}

		const inferredKind = aggregateSurfaceKind(surfaceKinds);

		return {
			...sig,
			scoping: {
				...sig.scoping,
				surface_kind: inferredKind,
			},
		};
	});
}
