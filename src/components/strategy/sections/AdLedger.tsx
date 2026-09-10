"use client";

import { motion } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";

/*
 * ONDA 2.2 — "Seu dinheiro de anúncio"
 *
 * Spend (platform-reported) × sessions (pixel-measured) × attributed
 * revenue (platform-reported), per connected ad platform. The section
 * the exam called the single biggest unshipped insight: the alert used
 * to say "SE há verba nessa origem…" while the exact spend sat unread
 * in syncMetadata.
 *
 * Honesty labels are part of the layout: every column header says
 * whether the number is measured or platform-reported, and the note
 * explains the join. Self-hide when no ledger (no ad integration).
 */

export interface AdLedgerRowUI {
	platform: string;
	platformLabel: string;
	spend30d: number;
	currency: string;
	attributedRevenue30d: number | null;
	measuredSessions: number;
	medianDurationS: number | null;
	pctNoScroll: number | null;
	costPerSession: number | null;
	syncedAt: string | null;
}

export interface AdLedgerUI {
	basis: "platform_plus_pixel";
	rows: AdLedgerRowUI[];
	note: string;
}

interface Props {
	adLedger: AdLedgerUI | null | undefined;
}

function fmtDuration(s: number | null): string {
	if (s === null) return "—";
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export default function AdLedger({ adLedger }: Props) {
	if (!adLedger || adLedger.rows.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-10"
		>
			<div
				data-vsgp-card
				className="rounded-2xl border border-edge bg-surface-card p-6 sm:p-7"
			>
				<div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-content-faint">
					Plataforma + pixel · últimos 30 dias
				</div>
				<h2 className="mb-4 font-serif text-[19px] font-medium text-content">
					Seu dinheiro de anúncio
				</h2>

				<div className="overflow-x-auto">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-edge text-left text-content-faint">
								<th className="py-2 pr-4 font-medium">Plataforma</th>
								<th className="py-2 pr-4 font-medium">
									Gasto <span className="font-normal">(plataforma)</span>
								</th>
								<th className="py-2 pr-4 font-medium">
									Sessões <span className="font-normal">(pixel)</span>
								</th>
								<th className="py-2 pr-4 font-medium">
									Custo/sessão
								</th>
								<th className="py-2 pr-4 font-medium">
									Permanência <span className="font-normal">(pixel)</span>
								</th>
								<th className="py-2 font-medium">
									Receita atribuída <span className="font-normal">(plataforma)</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{adLedger.rows.map((r) => (
								<tr key={r.platform} className="border-b border-edge/50 text-content">
									<td className="py-2.5 pr-4 font-medium">{r.platformLabel}</td>
									<td className="py-2.5 pr-4 font-mono tabular-nums">
										{fmtCurrencyUnits(r.spend30d, r.currency)}
									</td>
									<td className="py-2.5 pr-4 font-mono tabular-nums">
										{r.measuredSessions.toLocaleString("pt-BR")}
										{r.pctNoScroll !== null && (
											<span className="text-content-faint"> · {r.pctNoScroll}% sem rolar</span>
										)}
									</td>
									<td className="py-2.5 pr-4 font-mono tabular-nums">
										{r.costPerSession !== null
											? fmtCurrencyUnits(r.costPerSession, r.currency)
											: "—"}
									</td>
									<td className="py-2.5 pr-4 font-mono tabular-nums">
										{fmtDuration(r.medianDurationS)}
									</td>
									<td className="py-2.5 font-mono tabular-nums">
										{r.attributedRevenue30d !== null
											? fmtCurrencyUnits(r.attributedRevenue30d, r.currency)
											: <span className="text-content-faint">sem dado da plataforma</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<p className="mt-4 text-[11px] leading-relaxed text-content-faint">{adLedger.note}</p>
			</div>
		</motion.section>
	);
}
