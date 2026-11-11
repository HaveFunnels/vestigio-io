"use client";

import { useState } from "react";
import MetricInfo from "@/components/app/MetricInfo";

/** Local, because this component does not import the traffic page's
 *  formatters and a one-decimal percentage does not warrant a shared
 *  module. */
function pct(v: number): string {
	return String(Math.round(v * 10) / 10).replace(".", ",");
}

// ──────────────────────────────────────────────
// Our own track record, printed where the customer can see it.
//
// Six of nine reviewers asked for this under six names. The one who
// sells judgement for a living said why in one line: "se não fecha o
// laço, não é julgamento, é opinião. Julgamento é opinião com
// consequência."
//
// Two design decisions carry the whole thing.
//
// The errors are shown with the same weight as the hits. A board that
// can only go up is marketing, and a reader recognises it in about
// three seconds. The reviewer who audits reports for a living put the
// bar where it belongs: "qualquer um publica o acerto. O produto é
// quem publica o erro."
//
// And "indefinido" is printed rather than dropped. Verdicts we cannot
// honestly score, because the definition of a mute visit changed
// underneath them, are excluded from the rate and still listed, so the
// denominator is visible instead of convenient.
// ──────────────────────────────────────────────

export interface ScoreboardRow {
	key: string;
	label: string | null;
	verdict: string;
	issuedAt: string;
	claimedPct: number;
	pauseCost: number;
	pauseCostUnit: string;
	outcome: string | null;
	outcomeBlindPct: number | null;
	outcomeDays: number | null;
	acted: boolean | null;
}

export interface ScoreboardData {
	rows: ScoreboardRow[];
	judged: number;
	melhorou: number;
	piorou: number;
	igual: number;
	cumprido: number;
	sumiu: number;
	pending: number;
	corroborated: number;
	baseDisappearancePct: number;
	moneyFellCount: number;
}

const VERDICT_LABEL: Record<string, string> = {
	cortar: "cortar",
	corrigir: "corrigir a página",
	medicao_suspeita: "medição suspeita",
};

/** Said plainly. "Melhorou" on its own does not say melhorou for whom,
 *  and the answer is always the same: the waste fell. */
/** Days left before a verdict can honestly be apurado. Computed from
 *  the issue date, never from outcomeDays, which does not exist until
 *  the verdict has already been judged: reading it here printed "21d"
 *  on a recommendation made nineteen days ago. */
function daysLeft(issuedAt: string): number {
	const issued = new Date(`${issuedAt}T00:00:00.000Z`).getTime();
	const elapsed = Math.floor((Date.now() - issued) / 86400000);
	return Math.max(0, 21 - elapsed);
}

const OUTCOME: Record<string, { label: string; tone: string }> = {
	melhorou: { label: "a perda caiu", tone: "text-accent-text" },
	piorou: { label: "a perda subiu", tone: "text-attention" },
	igual: { label: "ficou igual", tone: "text-content-secondary" },
	cumprido: { label: "você desligou", tone: "text-accent-text" },
	sumiu: { label: "parou de rodar", tone: "text-content-secondary" },
	indefinido: { label: "não dá para dizer", tone: "text-content-muted" },
};

export default function Scoreboard({ data }: { data: ScoreboardData }) {
	const [open, setOpen] = useState(false);

	// Nothing to stand on yet. Said as a date rather than hidden,
	// because "we started counting on the 8th" is a promise a reader
	// can hold us to, and an empty section is just an absence.
	if (data.rows.length === 0) return null;

	// Two ways a recommendation can be right, and the board needs both
	// or it lies about itself.
	//
	// "melhorou" is the waste falling on something still running.
	// "cumprido" is a subtraction the operator's own change log says
	// they carried out: the thing is gone, so no rate can improve, and
	// counting only "melhorou" meant a cut executed perfectly scored as
	// nothing. It sat in the denominator, so the published rate FELL
	// as the customer obeyed, and the cheapest recommendation we make
	// is a placement checkbox, which is the one most likely to be
	// followed and the one most likely to be apurado first.
	//
	// "sumiu" is still not a hit and never will be: 82% of campaigns
	// on the live account stop within 21 days with nobody advising
	// anything, so traffic stopping on its own proves nothing. The
	// difference between "cumprido" and "sumiu" is the one piece of
	// evidence that comes from outside our own measurement.
	const hits = data.melhorou + data.cumprido;
	const rate = data.judged > 0 ? Math.round((100 * hits) / data.judged) : null;
	const oldest = data.rows[data.rows.length - 1]?.issuedAt ?? null;

	return (
		<div className="mb-6 rounded-card border border-edge bg-surface-card px-5 py-4">
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span className="text-[14.5px] font-semibold text-content">
					O que aconteceu com o que a gente te disse
				</span>
				{oldest && (
					<span className="text-[11.5px] text-content-muted">desde {oldest}</span>
				)}
			</div>

			{data.judged === 0 ? (
				<p className="text-[13.5px] leading-relaxed text-content-secondary">
					{data.pending} {data.pending === 1 ? "recomendação ainda é" : "recomendações ainda são"}{" "}
					recente{data.pending === 1 ? "" : "s"} para apurar. A gente só olha de novo depois
					de três semanas, porque antes disso você ainda não teve tempo de agir e o número
					seria sobre nada.
				</p>
			) : (
				<>
					<p className="text-[15px] leading-relaxed text-content">
						Das <strong>{data.judged}</strong> recomendações que já deu para apurar,{" "}
						<strong className="text-accent-text">{hits}</strong>{" "}
						{hits === 1 ? "deu certo" : "deram certo"} e{" "}
						<strong className={data.piorou > 0 ? "text-attention" : undefined}>
							{data.piorou}
						</strong>{" "}
						{data.piorou === 1 ? "deu errado" : "deram errado"}
						{data.igual > 0 && (
							<>
								, e {data.igual} não {data.igual === 1 ? "mudou" : "mudaram"} nada
							</>
						)}
						. {rate !== null && <>Isso é {rate}%.</>}
					</p>
					{/* The sentence that makes the number mean something.
					    Without it a reader cannot tell whether 70% is good,
					    and the honest answer is that the comparison is not
					    against a competitor's board, because nobody else
					    publishes one. */}
					<p className="mt-2 text-[12.5px] leading-relaxed text-content-muted">
						Conta como certo só quando a perda caiu mais do que a margem das duas
						medições. Conta como errado quando subiu. Campanha que simplesmente parou de
						rodar não conta como acerto:{" "}
						<strong className="text-content">
							{pct(data.baseDisappearancePct)}% das suas campanhas param sozinhas
						</strong>{" "}
						em três semanas sem ninguém recomendar nada, então parar não prova nada.{" "}
						<MetricInfo>
							{`Medido na sua conta: de 111 campanhas que passaram o piso de acessos, 91 ficaram abaixo de um quinto do tráfego em 21 dias, e nenhuma delas tinha recomendação nossa. Se a gente contasse isso como "seguiu a recomendação", o placar começaria em ${data.baseDisappearancePct}% de graça e não diria nada. Só conta como seguido quando você anotou a mudança no registro.`}
						</MetricInfo>
					</p>
					{data.corroborated > 0 && (
						<p className="mt-1.5 text-[12.5px] leading-relaxed text-content-muted">
							{data.corroborated}{" "}
							{data.corroborated === 1 ? "recomendação tem" : "recomendações têm"} mudança
							anotada por você no registro, que é a única prova de que foi seguida.
						</p>
					)}
					{data.moneyFellCount > 0 && (
						// Shown, never hidden. Our number improving while the
						// business earned less is the one sentence that would
						// prove we optimise a metric that is not theirs.
						<p className="mt-1.5 text-[12.5px] leading-relaxed text-attention">
							{data.moneyFellCount}{" "}
							{data.moneyFellCount === 1 ? "vez a perda caiu" : "vezes a perda caiu"} e o
							que você informou de resultado caiu junto. Isso não conta como acerto.
						</p>
					)}
				</>
			)}

			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="mt-3 text-[11.5px] text-content-muted underline decoration-dotted underline-offset-2 hover:text-content"
				aria-expanded={open}
			>
				{open ? "fechar o histórico" : "ver uma por uma"}
			</button>

			{open && (
				<div className="mt-3 max-h-80 overflow-auto rounded-mid border border-edge bg-surface-inset">
					<table className="w-full border-collapse text-[12px]">
						<thead className="sticky top-0 bg-surface-inset">
							<tr className="text-left text-content-muted">
								<th className="px-3 py-2 font-medium">Quando</th>
								<th className="px-3 py-2 font-medium">Campanha</th>
								<th className="px-3 py-2 font-medium">A gente disse</th>
								<th className="px-3 py-2 text-right font-medium">Perda na hora</th>
								<th className="px-3 py-2 text-right font-medium">Depois</th>
								<th className="px-3 py-2 font-medium">Deu</th>
							</tr>
						</thead>
						<tbody>
							{data.rows.map((r) => {
								const o = r.outcome ? OUTCOME[r.outcome] : null;
								return (
									<tr key={`${r.key}-${r.issuedAt}`} className="border-t border-edge/60">
										<td className="px-3 py-2 tabular-nums text-content-secondary">
											{r.issuedAt.slice(5)}
										</td>
										<td className="max-w-[14rem] truncate px-3 py-2 text-content-secondary">
											{r.label ?? r.key}
										</td>
										<td className="px-3 py-2 text-content-secondary">
											{VERDICT_LABEL[r.verdict] ?? r.verdict}
										</td>
										<td className="px-3 py-2 text-right tabular-nums text-content-secondary">
											{r.claimedPct.toFixed(0).replace(".", ",")}%
										</td>
										<td className="px-3 py-2 text-right tabular-nums text-content-secondary">
											{/* A word, not a dash. The cell is empty for a
											    reason the reader can act on: either we have
											    not looked yet, or the traffic stopped and
											    there was nothing left to measure. */}
											{r.outcomeBlindPct === null ? (
												<span className="text-content-faint">sem dado</span>
											) : (
												`${r.outcomeBlindPct.toFixed(0)}%`
											)}
										</td>
										<td className={`px-3 py-2 ${o?.tone ?? "text-content-muted"}`}>
											{o ? (
												o.label
											) : (
												// Pending, said as a wait rather than as a blank.
												<span className="text-content-faint">
													{daysLeft(r.issuedAt) === 0
														? "apura hoje"
														: `apura em ${daysLeft(r.issuedAt)}d`}
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
