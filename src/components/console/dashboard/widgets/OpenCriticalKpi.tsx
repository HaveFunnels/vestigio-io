"use client";

// ──────────────────────────────────────────────
// OpenCriticalKpi — compact KPI tile (liquid glass)
//
// Hero number = how many open critical findings the user has right
// now, plus the cycle-over-cycle delta. When there's room, we also
// surface up to 3 of those critical items inline so the user can
// click straight from the dashboard into the matching action drawer
// on the actions page (deep link via ?selected=<inferenceKey>).
//
// **Liquid glass treatment:** the tile uses a frosted background
// with a subtle inner highlight border so it reads as a "light
// surface" floating above the heavier solid cards.
//
// **Why critical-only:** users obsess over this number. It's the
// "what could lose me money TODAY" gauge. Promoting the top items
// to the same card removes a click — the gauge becomes the queue.
// ──────────────────────────────────────────────

import { SkullIcon as Skull } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function formatCompactCurrency(cents: number): string {
	const dollars = Math.abs(cents) / 100;
	if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
	if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
	return `$${Math.round(dollars)}`;
}

function OpenCriticalKpiComponent({ data, editing }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.open_critical_card");
	const router = useRouter();
	const { criticalOpenCount, criticalDeltaVsLastCycle, criticalOpenItems } =
		data.exposure;
	const isClean = criticalOpenCount === 0;
	const numberClass = isClean ? "text-emerald-400" : "text-red-400";
	const deltaPositive = criticalDeltaVsLastCycle > 0;
	const deltaNegative = criticalDeltaVsLastCycle < 0;
	const hasItems = criticalOpenItems.length > 0;

	// Click → /app/actions?selected=<inferenceKey>. The actions page
	// reads that param on mount and opens the matching action drawer.
	// Suppressed during edit mode so the user can drag/resize without
	// accidentally navigating away.
	const goToItem = (inferenceKey: string) => {
		if (editing) return;
		router.push(`/app/actions?selected=${encodeURIComponent(inferenceKey)}`);
	};

	return (
		<div className='relative flex h-full flex-col p-5'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/[0.06] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			{/* Eyebrow */}
			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Skull
					size={11}
					weight='bold'
					className={isClean ? "text-emerald-400" : "text-red-400"}
				/>
				<span>{t("label")}</span>
			</div>

			{/* Hero number + delta */}
			<div className='relative mt-2 flex items-baseline gap-3'>
				<span
					className={`font-mono text-4xl font-medium tabular-nums leading-none ${numberClass}`}
				>
					{criticalOpenCount}
				</span>
				{criticalDeltaVsLastCycle !== 0 && (
					<span
						className={`font-mono text-[11px] tabular-nums ${
							deltaPositive
								? "text-red-400"
								: deltaNegative
									? "text-emerald-400"
									: "text-content-muted"
						}`}
					>
						{deltaPositive ? "+" : ""}
						{t("cycle_delta", { count: criticalDeltaVsLastCycle })}
					</span>
				)}
			</div>

			{/* Inline list of top-3 critical items (only when there are
			    any). Each row is a clickable button that deep-links to
			    the matching action drawer on the actions page. */}
			{hasItems ? (
				<ul className='relative mt-3 flex flex-1 flex-col gap-1 overflow-hidden'>
					{criticalOpenItems.slice(0, 3).map((item) => (
						<li key={item.id}>
							<button
								type='button'
								onClick={() => goToItem(item.inferenceKey)}
								disabled={editing}
								title={`${item.title} · ${item.surface}`}
								className='group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-red-500/10 disabled:cursor-default disabled:hover:bg-transparent'
							>
								<span
									className='h-1.5 w-1.5 shrink-0 rounded-full bg-red-500'
									aria-hidden
								/>
								<span className='min-w-0 flex-1 truncate text-[11px] leading-tight text-content-secondary group-hover:text-content'>
									{item.title}
								</span>
								<span className='shrink-0 font-mono text-[10px] tabular-nums text-red-400'>
									−{formatCompactCurrency(item.impactCents)}
								</span>
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
					{t("caption_clear")}
				</p>
			)}
		</div>
	);
}

registerWidget({
	id: "open_critical_kpi",
	version: 3,
	nameKey: "console.dashboard.widgets.open_critical.name",
	descriptionKey: "console.dashboard.widgets.open_critical.description",
	category: "kpi",
	icon: "skull",
	defaultSize: { w: 3, h: 3 },
	minSize: { w: 2, h: 3 },
	maxSize: { w: 4, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: OpenCriticalKpiComponent,
});
