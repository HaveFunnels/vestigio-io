"use client";

import { useState } from "react";
import { sourceIdentity } from "../../../../packages/behavioral/source-identity";

// ──────────────────────────────────────────────
// What visitors did, by origin.
//
// The block this replaces was a five-column table: origin, sessions,
// median dwell, % no-scroll, % form-started, all at equal visual
// weight. Twenty-five numbers for a decision that needs one answer,
// which is where am I spending ad budget that does not become a
// visit. That is a ranking question answered with a table.
//
// Three changes, in order of how much they matter:
//
//   THE BAR IS THE SHARE. Sorted by sessions, descending, with a
//   horizontal bar. Facebook at 82% is visually eight times Tiktok at
//   10% without a single percentage label. Hierarchy by size, not by
//   colour.
//
//   TWO METRICS BECOME ONE READING. Median dwell and % no-scroll only
//   mean something as a pair: 29s with 76% no-scroll is someone
//   reading the first screen; 5s with 91% is someone passing through.
//   Requiring the reader to know that was the real defect. The pair is
//   now rendered as what it says, and the raw numbers move into the
//   expand as its evidence.
//
//   THE ALERT IS A ROW STATE. It used to be a loose paragraph above
//   the table, duplicating numbers that were already in it. Now the
//   affected origin carries a mark and opens by default, and the alert
//   text is its expanded content. One source of truth.
//
// Origins below a couple of percent collapse into one row. They clear
// the 100-session floor but are noise for the decision, and this is
// what keeps the block readable when there are ten origins instead of
// five.
//
// Nothing here claims a cause. "Passa sem ler" describes the measured
// behaviour; it does not say the creative is bad.
// ──────────────────────────────────────────────

export interface SourceRow {
	source: string;
	sessions: number;
	sharePct: number;
	medianDurationS: number;
	pctNoScroll: number;
	pctFormStarted: number;
}

export interface SourceAlert {
	source: string;
	text: string;
}

/** Origins under this share collapse into a single row. */
export const MINOR_SHARE_PCT = 2;

export type ReadingKey = "drive_by" | "explores" | "scrolls" | "first_screen" | "mixed";

export const READING: Record<ReadingKey, { label: string; help: string }> = {
	drive_by: {
		label: "Passa sem ler",
		help: "Fica poucos segundos e sai antes da primeira rolagem. Descreve o comportamento medido, não a qualidade do anúncio.",
	},
	explores: {
		label: "Explora a loja",
		help: "Permanência longa e rolagem na maior parte das sessões.",
	},
	scrolls: {
		label: "Entra e rola",
		help: "A maioria rola a página, mesmo em visitas curtas.",
	},
	first_screen: {
		label: "Lê a primeira tela",
		help: "Permanência razoável sem rolar: a decisão acontece no que está visível sem scroll.",
	},
	mixed: { label: "Comportamento misto", help: "Sem padrão dominante nesta janela." },
};

/**
 * The pair, read as one thing.
 *
 * Order matters: the drive-by case needs BOTH a short median and a
 * high no-scroll rate, which is the same pairing the alert threshold
 * uses, so a long visit that never scrolls is never called a
 * pass-through.
 */
export function readingFor(s: {
	medianDurationS: number;
	pctNoScroll: number;
}): ReadingKey {
	if (s.medianDurationS < 10 && s.pctNoScroll > 80) return "drive_by";
	if (s.medianDurationS >= 40) return "explores";
	if (s.pctNoScroll <= 40) return "scrolls";
	if (s.pctNoScroll > 60) return "first_screen";
	return "mixed";
}

const fmtDur = (s: number) => (s >= 60 ? `${Math.round(s / 60)}min` : `${s}s`);

export default function SourceReadings({
	sources,
	alerts,
}: {
	sources: SourceRow[];
	alerts: SourceAlert[];
}) {
	const alertBySource = new Map(alerts.map((a) => [a.source, a.text]));
	const ordered = [...sources].sort((a, b) => b.sessions - a.sessions);
	const major = ordered.filter(
		(s) => s.sharePct >= MINOR_SHARE_PCT || alertBySource.has(s.source),
	);
	const minor = ordered.filter((s) => !major.includes(s));
	const max = Math.max(1, ...ordered.map((s) => s.sessions));

	// An origin the alert fired on opens by default: it is the one row
	// the reader came here for.
	const [open, setOpen] = useState<string | null>(
		major.find((s) => alertBySource.has(s.source))?.source ?? null,
	);
	const [minorOpen, setMinorOpen] = useState(false);

	return (
		<div className="overflow-hidden rounded-2xl border border-edge bg-surface-card">
			{major.map((s, i) => {
				const id = sourceIdentity(s.source);
				const r = READING[readingFor(s)];
				const alerted = alertBySource.get(s.source);
				const isOpen = open === s.source;
				return (
					<div key={s.source} className={i > 0 ? "border-t border-edge" : ""}>
						<button
							type="button"
							onClick={() => setOpen(isOpen ? null : s.source)}
							aria-expanded={isOpen}
							className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-card-hover/60 sm:gap-4 sm:px-5"
						>
							<span className="flex min-w-0 shrink-0 items-center gap-2 sm:w-[120px]">
								<span
									aria-hidden
									className="inline-block h-2 w-2 shrink-0 rounded-full"
									style={{ backgroundColor: id.color }}
								/>
								<span className="truncate text-[13.5px] font-medium text-content">
									{id.label}
								</span>
							</span>

							{/* The bar carries the share, so no percentage label
							    is needed to establish the hierarchy. */}
							<span className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-content/[0.07] sm:block">
								<span
									className="block h-full rounded-full bg-content/30"
									style={{ width: `${Math.max(2, (s.sessions / max) * 100)}%` }}
								/>
							</span>

							<span className="shrink-0 font-mono text-[12.5px] tabular-nums text-content-secondary sm:w-[76px] sm:text-right">
								{s.sessions.toLocaleString("pt-BR")}
							</span>

							<span className="flex shrink-0 items-center gap-1.5 sm:w-[168px]">
								{alerted && (
									<svg
										aria-label="Merece atenção"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										strokeLinecap="round"
										className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
									>
										<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
									</svg>
								)}
								<span
									title={r.help}
									className="truncate text-[12.5px] text-content-secondary"
								>
									{r.label}
								</span>
							</span>

							<svg
								aria-hidden
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth={2}
								strokeLinecap="round"
								strokeLinejoin="round"
								className={`ml-auto h-3.5 w-3.5 shrink-0 text-content-faint transition-transform duration-200 ${
									isOpen ? "rotate-180" : ""
								}`}
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</button>

						{isOpen && (
							<div className="border-t border-edge bg-surface-inset/30 px-4 py-3.5 sm:px-5">
								{/* The raw pair, as evidence for the reading above. */}
								<dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
									<Metric label="Share do tráfego" value={`${s.sharePct}%`} />
									<Metric label="Permanência mediana" value={fmtDur(s.medianDurationS)} />
									<Metric label="Sai sem rolar" value={`${s.pctNoScroll}%`} />
									<Metric label="Toca em formulário" value={`${s.pctFormStarted}%`} />
								</dl>
								<p className="text-[12.5px] leading-[1.55] text-content-muted">
									{alerted ?? r.help}
								</p>
							</div>
						)}
					</div>
				);
			})}

			{minor.length > 0 && (
				<div className="border-t border-edge">
					<button
						type="button"
						onClick={() => setMinorOpen((v) => !v)}
						aria-expanded={minorOpen}
						className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-card-hover/60 sm:px-5"
					>
						<span className="text-[12.5px] text-content-muted">
							Outras origens ({minor.length})
						</span>
						<span className="ml-auto font-mono text-[12px] tabular-nums text-content-faint">
							{minor.reduce((n, s) => n + s.sessions, 0).toLocaleString("pt-BR")}
						</span>
						<svg
							aria-hidden
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							className={`h-3.5 w-3.5 shrink-0 text-content-faint transition-transform duration-200 ${
								minorOpen ? "rotate-180" : ""
							}`}
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					{minorOpen && (
						<div className="border-t border-edge bg-surface-inset/30 px-4 py-3 sm:px-5">
							{minor.map((s) => {
								const id = sourceIdentity(s.source);
								return (
									<div
										key={s.source}
										className="flex items-center gap-3 py-1.5 text-[12.5px]"
									>
										<span className="flex min-w-0 items-center gap-2">
											<span
												aria-hidden
												className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
												style={{ backgroundColor: id.color }}
											/>
											<span className="truncate text-content-secondary">{id.label}</span>
										</span>
										<span className="ml-auto font-mono tabular-nums text-content-muted">
											{s.sessions.toLocaleString("pt-BR")}
										</span>
										<span className="w-[150px] shrink-0 text-right text-content-muted">
											{READING[readingFor(s)].label}
										</span>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-[10.5px] uppercase tracking-[0.08em] text-content-faint">
				{label}
			</dt>
			<dd className="font-mono text-[14px] tabular-nums text-content">{value}</dd>
		</div>
	);
}
