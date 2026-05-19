"use client";

import { useTranslations } from "next-intl";
import { getPackStyle } from "@/lib/pack-colors";

// ──────────────────────────────────────────────
// CrossSignalNarrative — structured replacement for the prose
// narrative paragraph. Renders:
//
//   • A bolded summary line ("N findings cruzados em /checkout")
//   • An optional causal hint when temporalPattern === "sequential"
//   • A row of pack chips for the disciplines involved
//   • A bolded combined-exposure line
//
// Driven entirely by the structured fields we already pass into
// CrossSignalChainCard, so no aggregator changes are required and
// the rendering stays locale-correct without re-running through the
// caption-template engine.
// ──────────────────────────────────────────────

interface Link {
	pack: string;
	title: string;
	severity: string;
	impactCents: number;
	findingId: string;
	firstSeenAt: string | null;
}

interface Props {
	surface: string;
	links: Link[];
	totalImpactCents: number;
	temporalPattern: "sequential" | "simultaneous" | null;
	currency: string;
}

import { fmtCurrencyCents as formatCurrency } from "@/lib/format-currency";

export default function CrossSignalNarrative({
	surface,
	links,
	totalImpactCents,
	temporalPattern,
	currency,
}: Props) {
	const t = useTranslations("console.cross_signals");
	const tc = useTranslations("console.common");
	const tp = useTranslations("console.common.packs");

	// Unique packs preserving first-occurrence order
	const seenPacks = new Set<string>();
	const uniquePacks: string[] = [];
	for (const l of links) {
		if (!seenPacks.has(l.pack)) {
			seenPacks.add(l.pack);
			uniquePacks.push(l.pack);
		}
	}

	const packLabel = (p: string) =>
		tp.has(p)
			? tp(p)
			: p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

	const impactStr = formatCurrency(totalImpactCents, currency);

	return (
		<div className="mb-3 space-y-2 rounded-lg border border-edge/60 bg-surface-inset/40 p-3">
			{/* Summary line */}
			<p className="text-xs leading-relaxed text-content-secondary">
				{t.rich("narrative_summary", {
					count: links.length,
					surface,
					strong: (chunks) => (
						<strong className="font-semibold text-content">{chunks}</strong>
					),
					mono: (chunks) => (
						<span className="font-mono text-content">{chunks}</span>
					),
				})}
			</p>

			{/* Causal hint (only when sequential) */}
			{temporalPattern === "sequential" && uniquePacks.length >= 2 && (
				<p className="text-[11px] italic leading-relaxed text-amber-300/80">
					{t.rich("narrative_causal", {
						first: packLabel(uniquePacks[0]),
						last: packLabel(uniquePacks[uniquePacks.length - 1]),
						strong: (chunks) => (
							<strong className="font-semibold not-italic text-amber-200">
								{chunks}
							</strong>
						),
					})}
				</p>
			)}

			{/* Pack chips */}
			<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
				{uniquePacks.map((p) => {
					const style = getPackStyle(p);
					return (
						<span
							key={p}
							className="inline-flex items-center gap-1 rounded-full border border-edge/60 bg-surface-card px-2 py-0.5"
						>
							<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
							<span className={`text-[10px] font-semibold ${style.text}`}>
								{packLabel(p)}
							</span>
						</span>
					);
				})}
			</div>

			{/* Combined exposure */}
			<p className="pt-1 text-[11px] text-content-muted">
				{t.rich("narrative_combined_exposure", {
					impact: impactStr,
					per_month: tc("per_month_short"),
					strong: (chunks) => (
						<strong className="font-mono font-semibold tabular-nums text-red-400">
							{chunks}
						</strong>
					),
				})}
			</p>
		</div>
	);
}
