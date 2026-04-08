"use client";

// ──────────────────────────────────────────────
// ExposureKpiCard — total $/mo at risk + per-pack drill down
//
// The mirror image of MoneyRecoveredTicker. That one is the money
// already SAVED, this one is the money STILL AT RISK. Together they
// bracket the full "where am I bleeding, where have I plugged the
// holes" picture above the fold.
//
// **Negative-number rule (user spec):** monthly exposure represents
// money at risk → it IS a negative impact by definition. We display
// it with a leading minus sign and in red. The delta below it keeps
// the standard "down is good for exposure" color flip — when
// exposure FALLS, the change is good news → green; when exposure
// RISES, the change is bad news → red. The signs of the delta
// remain raw (no inversion) so users can mentally map the number
// to the actual movement.
//
// **Per-pack drill down:** Phase 4 user feedback was that the
// segmented bar (single 8px-tall horizontal divided by pack
// proportions) didn't make it clear which color was which pack.
// We dropped the bar entirely and replaced it with a 4-row vertical
// list — each row shows a colored dot, the pack name, and the
// monthly cents — so the color → pack → amount mapping is explicit.
// Cap to top 4 packs so the card stays compact.
// ──────────────────────────────────────────────

import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function formatCurrency(cents: number, currency: string): string {
	const dollars = cents / 100;
	if (dollars >= 1_000_000) {
		return (
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency,
				maximumFractionDigits: 1,
			}).format(dollars / 1_000_000) + "M"
		);
	}
	if (dollars >= 1_000) {
		return (
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency,
				maximumFractionDigits: 1,
			}).format(dollars / 1_000) + "k"
		);
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function packLabel(pack: string): string {
	const cleaned = pack.replaceAll("_", " ");
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function ExposureKpiCardComponent({ data }: WidgetProps) {
	const { monthlyCents, deltaVsLastCycleCents, currency, byPack } =
		data.exposure;
	// Negative-number rule: exposure is a loss → display with leading
	// minus sign and in red. Always.
	const heroNumber = `−${formatCurrency(monthlyCents, currency)}`;

	// Delta keeps the inverted color logic (down=good=green) but the
	// raw sign of the delta is preserved so the math reads honest.
	const exposureFell = deltaVsLastCycleCents < 0;
	const sign =
		deltaVsLastCycleCents > 0 ? "+" : deltaVsLastCycleCents < 0 ? "−" : "";
	const deltaFormatted = formatCurrency(
		Math.abs(deltaVsLastCycleCents),
		currency
	);

	// Top 4 packs only — keeps the drill-down compact and prevents
	// overflow when an org has lots of pack types active.
	const topPacks = byPack.slice(0, 4);

	return (
		<div className='relative flex h-full flex-col p-5'>
			{/* Subtle amber gradient — exposure is the warm "watch out" card */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/[0.04] via-transparent to-transparent'
				aria-hidden
			/>

			{/* Eyebrow */}
			<div className='relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Warning size={11} weight='bold' className='text-red-400' />
				<span>Monthly exposure</span>
			</div>

			{/* Hero number — always negative, always red */}
			<div className='relative mt-2 flex items-baseline gap-2'>
				<span className='font-mono text-4xl font-medium tabular-nums leading-none tracking-tight text-red-400'>
					{heroNumber}
				</span>
				<span className='font-mono text-[11px] text-content-faint'>/ mo</span>
			</div>

			{/* Delta — color follows whether exposure improved or worsened */}
			<div className='relative mt-1'>
				<span
					className={`font-mono text-[11px] tabular-nums ${
						exposureFell
							? "text-emerald-400"
							: deltaVsLastCycleCents > 0
								? "text-red-400"
								: "text-content-muted"
					}`}
				>
					{sign}
					{deltaFormatted} vs last cycle
				</span>
			</div>

			{/* Per-pack drill down — 4 rows, color dot + name + cents.
			    Replaces the old segmented bar (Phase 4 feedback: bar had
			    no legend, users couldn't tell which color was which pack). */}
			<div className='relative mt-3 flex flex-col gap-1'>
				{topPacks.map((p) => (
					<div key={p.pack} className='flex items-center gap-2 text-[11px]'>
						<div
							className={`h-2 w-2 shrink-0 rounded-sm ${p.colorClass}`}
							aria-hidden
						/>
						<span className='min-w-0 flex-1 truncate text-content-secondary'>
							{packLabel(p.pack)}
						</span>
						<span className='font-mono tabular-nums text-content-faint'>
							−{formatCurrency(p.cents, currency)}
						</span>
					</div>
				))}
				{topPacks.length === 0 && (
					<div className='text-[11px] text-content-faint'>No open packs</div>
				)}
			</div>
		</div>
	);
}

registerWidget({
	id: "exposure_kpi",
	version: 2,
	nameKey: "console.dashboard.widgets.exposure.name",
	descriptionKey: "console.dashboard.widgets.exposure.description",
	category: "kpi",
	icon: "warning",
	defaultSize: { w: 5, h: 3 },
	minSize: { w: 4, h: 3 },
	maxSize: { w: 6, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: ExposureKpiCardComponent,
});
