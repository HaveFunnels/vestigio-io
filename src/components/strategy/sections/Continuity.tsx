"use client";

import { motion } from "framer-motion";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import type { ContinuitySection } from "../types";

/*
 * E3 — Continuity from last month's plan
 *
 * Sits between the thesis and the buyer segments. Tells the customer
 * "this month is connected to the choices you made last month" so the
 * recurring product stops reading as a series of one-off reports.
 *
 * Hidden when previousMonth is null (month-1 envs, no prior plan to
 * compare).
 */

const STATUS_BADGE: Record<string, { label: string; chip: string; dot: string }> = {
	done: {
		label: "Concluído",
		chip: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
		dot: "bg-emerald-400",
	},
	in_progress: {
		label: "Em progresso",
		chip: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
		dot: "bg-sky-400",
	},
	in_review: {
		label: "Em revisão",
		chip: "bg-violet-500/10 text-violet-300 ring-violet-500/20",
		dot: "bg-violet-400",
	},
	blocked: {
		label: "Bloqueado",
		chip: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
		dot: "bg-amber-400",
	},
	todo: {
		label: "Não iniciado",
		chip: "bg-content-faint/10 text-content-muted ring-content-faint/20",
		dot: "bg-content-faint",
	},
};

interface Props {
	continuity: ContinuitySection | null | undefined;
}

export default function Continuity({ continuity }: Props) {
	const { currency } = useMcpData();
	if (!continuity || !continuity.previousMonth || continuity.steps.length === 0) {
		return null;
	}

	const exposureWorse = continuity.exposureDeltaSinceLastPlan > 0;
	const exposureDeltaLabel = fmtCurrencyUnits(
		Math.abs(continuity.exposureDeltaSinceLastPlan),
		currency,
	);

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que ficou de {continuity.previousMonthLabel}
				</h2>
				<div className="text-[11px] text-content-faint">continuidade · status hoje</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				{/* Net delta row — the headline number for this section. */}
				<div className="mb-5 grid grid-cols-1 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-2">
					<div>
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Recuperado desde o plano anterior
						</div>
						<div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-content">
							{fmtCurrencyUnits(continuity.capturedSinceLastPlan, currency)}
						</div>
					</div>
					<div>
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Exposição vs. plano anterior
						</div>
						<div
							className={`mt-1 font-mono text-[22px] font-semibold tabular-nums ${
								exposureWorse ? "text-amber-300" : "text-emerald-300"
							}`}
						>
							{exposureWorse ? "+" : "−"}
							{exposureDeltaLabel}
							<span className="ml-1 text-[11px] font-normal text-content-faint">
								{exposureWorse ? "abriu mais" : "fechou líquido"}
							</span>
						</div>
					</div>
				</div>

				{/* Per-step status list — verbatim titles from prior plan,
				    current status badge, captured impact + resolved/total
				    ratio so the customer sees how the bet played out. */}
				<ul className="space-y-3">
					{continuity.steps.map((s, i) => {
						const badge = STATUS_BADGE[s.statusNow] ?? STATUS_BADGE.todo;
						const ratio =
							s.totalLinkedCount > 0
								? `${s.resolvedLinkedCount}/${s.totalLinkedCount} problemas resolvidos`
								: "sem problemas linkados";
						return (
							<li
								key={i}
								className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/30 p-3 sm:flex-row sm:items-center sm:gap-4"
							>
								<div className="flex flex-1 items-start gap-3">
									<span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${badge.dot}`} />
									<div className="min-w-0 flex-1">
										<div className="truncate text-[14px] font-medium text-content">
											{s.title}
										</div>
										<div className="mt-0.5 text-[11px] text-content-muted">
											{ratio}
											{s.capturedImpact > 0 && (
												<>
													{" "}· recuperado{" "}
													<span className="font-mono tabular-nums text-content">
														{fmtCurrencyUnits(s.capturedImpact, currency)}
													</span>
												</>
											)}
										</div>
									</div>
								</div>
								<span
									className={`shrink-0 self-start rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${badge.chip} sm:self-center`}
								>
									{badge.label}
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		</motion.section>
	);
}
