"use client";

/*
 * ONDA 2.4 — the certainty grade, visible on every value claim.
 *
 * EXAME §3.D: the plan mixed measured fact, severity-based estimate
 * and unverified template at the same visual level, so when one weak
 * claim collapsed it took the measured gold down with it. Every money/
 * fact surface now carries its grade:
 *
 *   MEDIDO    — counted by the pixel / probes. Not a model.
 *   ESTIMADO  — severity-percentage estimate over declared revenue.
 *   VERIFICAR — low-confidence signal; treat as a lead, check before
 *               acting on the number.
 */

export type ClaimBasis = "measured" | "estimated" | "verify";

const STYLE: Record<ClaimBasis, { label: string; cls: string; title: string }> = {
	measured: {
		label: "MEDIDO",
		cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
		title: "Contagem direta (pixel ou verificação de página) — não é estimativa.",
	},
	estimated: {
		label: "ESTIMADO",
		cls: "border-sky-500/25 bg-sky-500/10 text-sky-300",
		title: "Estimativa por severidade sobre a receita informada — leia como ordem de grandeza, não como medição.",
	},
	verify: {
		label: "VERIFICAR",
		cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
		title: "Sinal de confiança baixa — confirme antes de agir sobre o número.",
	},
};

export default function BasisChip({
	basis,
	className = "",
}: {
	basis: ClaimBasis;
	className?: string;
}) {
	const s = STYLE[basis];
	return (
		<span
			title={s.title}
			className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-[1px] font-sans text-[9px] font-semibold uppercase tracking-[0.1em] ${s.cls} ${className}`}
		>
			{s.label}
		</span>
	);
}

/** Grade for a next step: measured synth steps carry zero impact and
 *  no linked findings; low aggregated confidence reads VERIFICAR. */
export function stepBasis(step: {
	combinedImpact?: { midpoint: number } | null;
	linkedFindingRefs?: string[];
	confidenceTier?: "low" | "medium" | "high" | null;
}): ClaimBasis {
	if (
		(step.combinedImpact?.midpoint ?? 0) === 0 &&
		(step.linkedFindingRefs?.length ?? 0) === 0
	) {
		return "measured";
	}
	if (step.confidenceTier === "low") return "verify";
	return "estimated";
}
