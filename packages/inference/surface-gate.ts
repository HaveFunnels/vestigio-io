import { effectiveSurfaceKind, SurfaceKind } from "../domain";
import type { Inference } from "../domain";
import {
	INFERENCE_ACCEPTED_SURFACES,
	isSurfaceAccepted,
} from "./accepted-surfaces";

// ──────────────────────────────────────────────
// Surface gate — Wave 22.5 Tier 2
//
// Filters out inferences whose stamped surface_kind doesn't match the
// surfaces declared as accepted in INFERENCE_ACCEPTED_SURFACES. Runs
// after Tier 1's stampInferenceSurfaceKinds, so every inference has a
// surface_kind on its scoping at this point.
//
// The gate has two modes:
//   - 'warn'  (default during migration): logs the rejection but
//             keeps the inference in the output. Lets us observe how
//             many findings would be filtered before flipping the
//             switch.
//   - 'throw' (post-migration): drops rejected inferences from the
//             returned array. The rejection log still fires so admins
//             can audit what was filtered per cycle.
//
// Inferences without a manifest entry pass through unfiltered (default
// "accept all"). Adding a new inference doesn't break the engine; it
// only starts being gated once it has an explicit declaration.
// ──────────────────────────────────────────────

export type SurfaceGateMode = "warn" | "throw";

export interface SurfaceGateResult {
	/** Inferences that passed the gate. */
	kept: Inference[];
	/** Inferences that the gate would have dropped (mode='throw') or
	 *  flagged (mode='warn'). Each carries the rejection reason for
	 *  audit + admin debug. */
	rejected: Array<{
		inference: Inference;
		stamped_surface: SurfaceKind;
		declared_surfaces: ReadonlyArray<SurfaceKind>;
	}>;
}

/**
 * Apply the surface gate to a list of inferences.
 *
 * Returns a result object split into kept + rejected. In 'throw' mode,
 * the returned `kept` array excludes the rejections; in 'warn' mode,
 * the rejections are STILL included in `kept` (so callers get every
 * inference) but the rejection log + counters help observe drift.
 */
export function applySurfaceGate(
	inferences: readonly Inference[],
	mode: SurfaceGateMode = "warn",
): SurfaceGateResult {
	const kept: Inference[] = [];
	const rejected: SurfaceGateResult["rejected"] = [];

	for (const inf of inferences) {
		const declared = INFERENCE_ACCEPTED_SURFACES[inf.inference_key];
		const stamped = effectiveSurfaceKind(inf.scoping.surface_kind);

		if (isSurfaceAccepted(stamped, declared)) {
			kept.push(inf);
			continue;
		}

		rejected.push({
			inference: inf,
			stamped_surface: stamped,
			declared_surfaces: declared || [],
		});

		if (mode === "warn") {
			// 'warn' mode keeps the inference; flagged for observation.
			kept.push(inf);
		}
		// 'throw' mode drops it.
	}

	if (rejected.length > 0) {
		const grouped = new Map<string, number>();
		for (const r of rejected) {
			const k = `${r.inference.inference_key}:${r.stamped_surface}->${r.declared_surfaces.join(",")}`;
			grouped.set(k, (grouped.get(k) || 0) + 1);
		}
		const sample = Array.from(grouped.entries()).slice(0, 5);
		console.warn(
			`[surface-gate] mode=${mode} rejected=${rejected.length}/${inferences.length} top=${sample
				.map(([k, n]) => `${k}(x${n})`)
				.join(" ")}`,
		);
	}

	return { kept, rejected };
}
