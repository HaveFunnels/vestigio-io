"use client";

// ──────────────────────────────────────────────
// MoneyRecoveredTicker — the dashboard hero element
//
// Renders the running total of $ impact the user has recovered
// since joining Vestigio. Big mono number, dominant placement,
// signed delta vs the last 7 days.
//
// **Why it matters (the viciante mechanic):** this is the single
// number that ties Vestigio's value to the user's bottom line in
// one glance. Operators have asked "how much have I actually saved
// with this?" and until this widget existed there was no answer.
// Now it's the first thing they see when they open the app each
// morning, and it only goes up. That asymmetry is the hook.
//
// Phase 1 ships static (no count-up animation yet — that lives in
// Phase 5 polish). The number renders directly from mock data.
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/dist/ssr";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function formatCurrency(cents: number, currency: string): string {
	const dollars = cents / 100;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function formatSignedCents(cents: number, currency: string): string {
	const sign = cents >= 0 ? "+" : "−";
	const formatted = formatCurrency(Math.abs(cents), currency);
	return `${sign}${formatted}`;
}

function MoneyRecoveredTickerComponent({ data }: WidgetProps) {
	const t = useTranslations("console.money_recovered");
	const { totalCents, last7dCents, last30dCents, currency, caption } =
		data.moneyRecovered;
	const sevenDayPositive = last7dCents > 0;

	return (
		<div className='relative flex h-full flex-col p-5'>
			{/* Subtle emerald gradient highlight */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-transparent'
				aria-hidden
			/>

			{/* Eyebrow */}
			<div className='relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<TrendUp size={11} weight='bold' className='text-emerald-400' />
				<span>{t("eyebrow")}</span>
			</div>

			{/* Hero number */}
			<div className='relative mt-2 flex items-end gap-3'>
				<span className='font-mono text-5xl font-medium tabular-nums leading-none tracking-tight text-emerald-400'>
					{formatCurrency(totalCents, currency)}
				</span>
			</div>

			{/* Deltas — twin rows under the hero */}
			<div className='relative mt-3 flex items-baseline gap-5'>
				<div className='flex flex-col gap-0.5'>
					<span className='text-[10px] uppercase tracking-wider text-content-faint'>
						{t("seven_days")}
					</span>
					<span
						className={`font-mono text-xs tabular-nums ${
							sevenDayPositive ? "text-emerald-400" : "text-content-muted"
						}`}
					>
						{formatSignedCents(last7dCents, currency)}
					</span>
				</div>
				<div className='flex flex-col gap-0.5'>
					<span className='text-[10px] uppercase tracking-wider text-content-faint'>
						{t("thirty_days")}
					</span>
					<span
						className={`font-mono text-xs tabular-nums ${
							last30dCents > 0 ? "text-emerald-400" : "text-content-muted"
						}`}
					>
						{formatSignedCents(last30dCents, currency)}
					</span>
				</div>
			</div>

			{/* Caption — pushed to the bottom so the eye rests on it */}
			<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "money_recovered_ticker",
	version: 2,
	nameKey: "console.dashboard.widgets.money_recovered.name",
	descriptionKey: "console.dashboard.widgets.money_recovered.description",
	category: "kpi",
	icon: "trend-up",
	defaultSize: { w: 4, h: 3 },
	minSize: { w: 3, h: 3 },
	maxSize: { w: 6, h: 4 },
	resizable: true,
	// Locked — this is the hero element. Removing it leaves the
	// dashboard without its anchor moment.
	removable: false,
	inCatalog: true,
	dataKeys: ["moneyRecovered"],
	Component: MoneyRecoveredTickerComponent,
});
