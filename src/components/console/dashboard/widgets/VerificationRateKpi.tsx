"use client";

// ──────────────────────────────────────────────
// VerificationRateKpi — compact KPI tile (liquid glass)
//
// % of latest-cycle findings that have been independently verified
// (`verification_maturity = 'confirmed'`). The trust meter for the
// dashboard — high % means the user can trust the rest of the
// numbers, low % means findings are still in the "we think but
// haven't proven" stage.
//
// Reads from `data.healthScore.components.verification` so this
// widget needs no new data slice. Just a different lens on data
// the aggregator already produces.
// ──────────────────────────────────────────────

import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function rateColor(rate: number): string {
	if (rate >= 80) return "text-emerald-400";
	if (rate >= 60) return "text-amber-400";
	return "text-content-secondary";
}

function VerificationRateKpiComponent({ data }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.verification_rate_card");
	const rate = data.healthScore.components.verification;
	const caption =
		rate >= 80
			? t("caption_strong")
			: rate >= 60
				? t("caption_healthy")
				: rate >= 40
					? t("caption_waiting")
					: t("caption_backing_up");
	const numberClass = rateColor(rate);

	return (
		<div className='relative flex h-full flex-col p-4'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-400/[0.05] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<SealCheck size={11} weight='bold' className='text-blue-400' />
				<span>{t("label")}</span>
			</div>

			<div className='relative mt-2 flex items-baseline gap-1'>
				<span
					className={`font-mono text-4xl font-medium tabular-nums leading-none ${numberClass}`}
				>
					{rate}
				</span>
				<span className='font-mono text-xs text-content-faint'>%</span>
			</div>

			<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "verification_rate_kpi",
	version: 1,
	nameKey: "console.dashboard.widgets.verification_rate.name",
	descriptionKey: "console.dashboard.widgets.verification_rate.description",
	category: "kpi",
	icon: "shield-check",
	defaultSize: { w: 3, h: 2 },
	minSize: { w: 2, h: 2 },
	maxSize: { w: 4, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["healthScore"],
	Component: VerificationRateKpiComponent,
});
