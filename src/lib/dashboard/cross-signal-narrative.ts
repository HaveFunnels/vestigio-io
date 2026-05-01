import type { CrossSignalChain } from "./types";
import type { CompoundFinding } from "../../../packages/composites/compound-findings";

// ──────────────────────────────────────────────
// Cross-Signal Narrative Generator
//
// Template-based, deterministic, i18n-ready.
// No LLM calls. Generates human-readable explanation
// of why a cross-signal chain matters.
//
// Pack priority order reflects causal direction:
// security issues → trust erosion → behavioral friction → revenue loss
// ──────────────────────────────────────────────

const PACK_PRIORITY: Record<string, number> = {
	security_posture: 0,
	scale_readiness: 1,
	trust_gap: 2,
	chargeback_resilience: 3,
	chargeback: 3,
	behavioral: 4,
	friction_tax: 5,
	first_impression: 6,
	revenue_integrity: 7,
	revenue: 7,
};

const PACK_LABELS: Record<string, string> = {
	security_posture: "Security",
	scale_readiness: "Scale",
	trust_gap: "Trust",
	chargeback_resilience: "Chargeback",
	chargeback: "Chargeback",
	behavioral: "Behavioral",
	friction_tax: "Friction",
	first_impression: "First Impression",
	revenue_integrity: "Revenue",
	revenue: "Revenue",
};

function packPriority(pack: string): number {
	return PACK_PRIORITY[pack] ?? 50;
}

function packLabel(pack: string): string {
	return PACK_LABELS[pack] ?? pack.replace(/_/g, " ");
}

function formatImpact(cents: number): string {
	const d = Math.abs(cents) / 100;
	if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
	if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
	return `$${Math.round(d)}`;
}

/**
 * Generate a narrative string for a cross-signal chain.
 * Sorted by pack priority (cause → effect direction).
 */
export function generateNarrative(chain: CrossSignalChain): string {
	const sorted = [...chain.links].sort(
		(a, b) => packPriority(a.pack) - packPriority(b.pack),
	);

	const impact = formatImpact(chain.totalImpactCents);

	let narrative: string;

	if (sorted.length === 2) {
		narrative = `Your ${chain.surface} has a cross-domain issue: ${sorted[0].title} (${packLabel(sorted[0].pack)}) contributes to ${sorted[1].title} (${packLabel(sorted[1].pack)}), with ~${impact}/mo at risk.`;
	} else {
		const linkDescriptions = sorted
			.map((l) => `${l.title} (${packLabel(l.pack)})`)
			.join(", ");
		narrative = `Your ${chain.surface} has ${sorted.length} cross-domain issues: ${linkDescriptions}, leading to ~${impact}/mo in combined exposure.`;
	}

	if (chain.temporalPattern === "sequential" && sorted.length >= 2) {
		const first = packLabel(sorted[0].pack);
		const last = packLabel(sorted[sorted.length - 1].pack);
		narrative += ` This appears to be a cause-effect chain — ${first} findings preceded ${last} findings.`;
	}

	return narrative;
}

// ──────────────────────────────────────────────
// Wave 4.7: Compound Finding → CrossSignalChain
//
// Converts compound findings into CrossSignalChain
// objects so the Cross-Signal Surface can render
// them as priority chains (sorted above ad-hoc
// surface correlations).
// ──────────────────────────────────────────────

/**
 * Convert compound findings into CrossSignalChain format for the
 * cross-signal surface. Compound chains carry their own narrative
 * and have a `sequential` temporal pattern (causal chain by definition).
 */
export function compoundFindingsToChains(
	compounds: CompoundFinding[],
): CrossSignalChain[] {
	return compounds.map((cf) => {
		const links = cf.chain.map((link) => ({
			pack: link.pack,
			title: link.description,
			severity: cf.severity,
			impactCents: Math.round(cf.combined_impact_cents / cf.chain.length),
			findingId: cf.id,
			firstSeenAt: null,
		}));

		return {
			surface: cf.affected_surfaces[0] || "/",
			links,
			totalImpactCents: cf.combined_impact_cents,
			temporalPattern: "sequential" as const,
			narrative: cf.narrative,
			firstDetectedAt: null,
		};
	});
}
