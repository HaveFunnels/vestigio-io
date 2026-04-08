"use client";

// ──────────────────────────────────────────────
// ExposureKpiCard — total $/mo at risk + per-pack split
//
// The mirror image of MoneyRecoveredTicker — that one shows the
// money already SAVED, this one shows the money STILL AT RISK.
// Together they bracket the full "where am I bleeding, where have
// I plugged the holes" picture above the fold.
//
// **Inverted color rule:** for exposure, DOWN deltas are GOOD.
// Less money at risk = healthier. So a negative delta (exposure
// went down) renders in emerald; a positive delta (more new
// findings than resolutions) renders in red. Always show with the
// arrow + sign so the color isn't the only signal.
// ──────────────────────────────────────────────

import { Warning } from "@phosphor-icons/react/dist/ssr";
import { registerWidget, type WidgetProps } from "@/lib/dashboard/widget-registry";

function formatCurrency(cents: number, currency: string): string {
	const dollars = cents / 100;
	if (dollars >= 1_000_000) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 1,
		}).format(dollars / 1_000_000) + "M";
	}
	if (dollars >= 1_000) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 1,
		}).format(dollars / 1_000) + "k";
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function ExposureKpiCardComponent({ data }: WidgetProps) {
	const { monthlyCents, deltaVsLastCycleCents, currency, byPack } = data.exposure;
	// For exposure, NEGATIVE delta is the GOOD outcome (less money
	// at risk). Flip the color logic from the standard "up is green".
	const exposureFell = deltaVsLastCycleCents < 0;
	const sign = deltaVsLastCycleCents >= 0 ? "+" : "−";
	const deltaFormatted = formatCurrency(Math.abs(deltaVsLastCycleCents), currency);

	const totalForBar = byPack.reduce((acc, p) => acc + p.cents, 0) || 1;

	return (
		<div className="flex h-full flex-col p-6">
			{/* Eyebrow */}
			<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				<Warning size={12} weight="bold" className="text-amber-400" />
				<span>Monthly exposure</span>
			</div>

			{/* Hero number */}
			<div className="mt-3 flex items-baseline gap-2">
				<span className="font-mono text-4xl font-medium leading-none tracking-tight text-content tabular-nums">
					{formatCurrency(monthlyCents, currency)}
				</span>
				<span className="font-mono text-xs text-content-faint">/ mo</span>
			</div>

			{/* Delta — color flipped for exposure (down is good) */}
			<div className="mt-2">
				<span
					className={`font-mono text-xs tabular-nums ${
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

			{/* Per-pack segmented bar — single 1px-tall horizontal divided
			    by pack proportional to cents. Shows where the exposure
			    actually lives (revenue vs scale vs chargeback vs behavioral).
			    No legend — colors are documented in the design system. */}
			<div className="mt-auto flex flex-col gap-1.5 pt-3">
				<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-inset">
					{byPack.map((p) => (
						<div
							key={p.pack}
							className={p.colorClass}
							style={{ width: `${(p.cents / totalForBar) * 100}%` }}
							title={`${p.pack}: ${formatCurrency(p.cents, currency)}/mo`}
						/>
					))}
				</div>
				<div className="text-[10px] uppercase tracking-wider text-content-faint">
					split by pack
				</div>
			</div>
		</div>
	);
}

registerWidget({
	id: "exposure_kpi",
	version: 1,
	nameKey: "console.dashboard.widgets.exposure.name",
	descriptionKey: "console.dashboard.widgets.exposure.description",
	category: "kpi",
	icon: "warning",
	defaultSize: { w: 4, h: 2 },
	minSize: { w: 3, h: 2 },
	maxSize: { w: 6, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: ExposureKpiCardComponent,
});
