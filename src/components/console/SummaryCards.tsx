"use client";

import { useRef, useState, useEffect } from "react";

// ──────────────────────────────────────────────
// SummaryCards — KPI strip used across the console
//
// Phase 5 polish: aligned to the dashboard's design language so the
// 4 console pages that consume this (Actions, Analysis, Workspaces,
// Inventory) inherit the same hero zone + caption + colored shadow
// + JetBrains Mono treatment that the dashboard cards use.
//
// **What changed in this rewrite (vs the v1 ApexCharts version):**
//   1. Hero zone hierarchy — small uppercase label, big mono number,
//      caption strip at the bottom
//   2. Theme-aware colors using the `text-{tone}-600 dark:text-{tone}-400`
//      pattern (the old dark-only `text-emerald-400` rendered illegibly
//      in light mode)
//   3. Colored drop shadow per variant — subtle but enough to make the
//      hierarchy of severity readable from across the room. Tuned via
//      `shadow-[0_8px_24px_-12px_rgba(...)]`.
//   4. Subtle gradient highlight in the corner via an absolute layer
//      with `pointer-events-none` (mirrors the dashboard liquid glass
//      pattern, but lower-key — these cards are denser, fewer at a time)
//   5. Inline SVG sparkline replaces ApexCharts → ~80kb less per page
//      that uses sparklines, and full theme awareness without runtime
//      color injection
//   6. New `negative` prop applies the dashboard's negative-number rule:
//      values that represent loss (e.g. "Total Impact Addressable" =
//      money still on the table) are displayed with a leading minus
//      sign and forced red, regardless of the underlying variant.
//
// **API back-compat:** the existing `SummaryCard` shape is preserved.
// New props (`negative`, `prefix`) are additive — old call sites keep
// rendering, just with better typography/colors. No consumer needs to
// change unless they want the negative red treatment.
// ──────────────────────────────────────────────

export interface SummaryCard {
	label: string;
	value: string | number;
	subtext?: string;
	variant?: "default" | "success" | "warning" | "danger" | "info";
	sparkData?: number[];
	/** When true, prepends a leading minus sign and forces the value
	 *  color to red, regardless of variant. Use for metrics that
	 *  represent a loss (exposure, addressable impact, etc). */
	negative?: boolean;
	/** Optional prefix that sits inline before the value, smaller and
	 *  faint. Useful for short context like "$" or unit labels when
	 *  the value itself is just a number. */
	prefix?: string;
}

type Variant = NonNullable<SummaryCard["variant"]>;

// Tone tokens for each variant. Values use the
// `text-{tone}-600 dark:text-{tone}-400` pattern at render time so
// both light and dark themes look correct.
const variantValueColor: Record<Variant, string> = {
	default: "text-content",
	success: "text-emerald-600 dark:text-emerald-400",
	warning: "text-amber-600 dark:text-amber-400",
	danger: "text-red-600 dark:text-red-400",
	info: "text-blue-600 dark:text-blue-400",
};

// Eyebrow icon dot color by variant — anchors the label to the same
// hue as the value below it without making the whole card colored.
const variantDotColor: Record<Variant, string> = {
	default: "bg-content-faint",
	success: "bg-emerald-500",
	warning: "bg-amber-500",
	danger: "bg-red-500",
	info: "bg-blue-500",
};

// Colored drop shadow per variant. Tuned to be present-but-subtle —
// the shadow color matches the value color so the eye reads severity
// from peripheral vision before reading the number itself.
const variantShadow: Record<Variant, string> = {
	default: "shadow-[0_8px_24px_-14px_rgba(0,0,0,0.35)]",
	success: "shadow-[0_8px_24px_-12px_rgba(16,185,129,0.28)]",
	warning: "shadow-[0_8px_24px_-12px_rgba(245,158,11,0.28)]",
	danger: "shadow-[0_8px_24px_-12px_rgba(239,68,68,0.28)]",
	info: "shadow-[0_8px_24px_-12px_rgba(59,130,246,0.28)]",
};

// Subtle gradient highlight layer — sits behind content as an
// absolute pointer-events-none div. Color matches the variant.
const variantGradient: Record<Variant, string> = {
	default: "from-transparent",
	success: "from-emerald-500/[0.05]",
	warning: "from-amber-500/[0.05]",
	danger: "from-red-500/[0.05]",
	info: "from-blue-500/[0.05]",
};

const variantSparkStroke: Record<Variant, string> = {
	default: "stroke-content-faint",
	success: "stroke-emerald-500",
	warning: "stroke-amber-500",
	danger: "stroke-red-500",
	info: "stroke-blue-500",
};

// ── Inline SVG sparkline ──
//
// Replaces ApexCharts. Same footprint (40px tall, fills width), no
// runtime dependency, full theme awareness via Tailwind classes on
// the path element. The gradient ID is suffixed with the variant to
// avoid collisions when the same page renders multiple sparklines.
function Sparkline({ data, variant }: { data: number[]; variant: Variant }) {
	if (data.length < 2) return null;
	const w = 80;
	const h = 32;
	const padding = 2;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = Math.max(1, max - min);
	const points = data.map((v, i) => {
		const x = padding + (i / (data.length - 1)) * (w - padding * 2);
		const y = padding + (1 - (v - min) / range) * (h - padding * 2);
		return `${x},${y}`;
	});
	const pathD = `M ${points.join(" L ")}`;
	const areaD = `${pathD} L ${w - padding},${h - padding} L ${padding},${h - padding} Z`;
	const gradId = `summary-spark-${variant}`;
	const strokeClass = variantSparkStroke[variant];
	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			preserveAspectRatio='none'
			className='shrink-0'
		>
			<defs>
				<linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
					<stop
						offset='0%'
						className={strokeClass.replace("stroke", "stop")}
						stopOpacity='0.25'
					/>
					<stop
						offset='100%'
						className={strokeClass.replace("stroke", "stop")}
						stopOpacity='0'
					/>
				</linearGradient>
			</defs>
			<path d={areaD} fill={`url(#${gradId})`} />
			<path
				d={pathD}
				fill='none'
				className={strokeClass}
				strokeWidth={1.5}
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}

function CardContent({ card }: { card: SummaryCard }) {
	const variant: Variant = card.variant || "default";
	const valueColor = card.negative
		? "text-red-600 dark:text-red-400"
		: variantValueColor[variant];
	const valueDisplay = card.negative
		? `−${String(card.value)}`
		: card.value;

	return (
		<div
			className={`relative h-full overflow-hidden rounded-xl border border-edge bg-surface-card p-5 transition-colors ${variantShadow[variant]}`}
		>
			<div
				className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br ${variantGradient[variant]} via-transparent to-transparent`}
				aria-hidden
			/>

			<div className='relative flex h-full items-start justify-between gap-3'>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-1.5'>
						<span
							className={`h-1.5 w-1.5 shrink-0 rounded-full ${variantDotColor[variant]}`}
							aria-hidden
						/>
						<span className='truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
							{card.label}
						</span>
					</div>

					<div className='mt-2 flex items-baseline gap-1'>
						{card.prefix && (
							<span className='font-mono text-xs text-content-faint'>
								{card.prefix}
							</span>
						)}
						<span
							className={`font-mono text-2xl font-medium tabular-nums leading-none ${valueColor}`}
						>
							{valueDisplay}
						</span>
					</div>

					{card.subtext && (
						<p className='mt-2 line-clamp-2 text-[11px] leading-snug text-content-muted'>
							{card.subtext}
						</p>
					)}
				</div>

				{card.sparkData && card.sparkData.length > 1 && (
					<Sparkline data={card.sparkData} variant={variant} />
				)}
			</div>
		</div>
	);
}

function MobileCarousel({ cards }: { cards: SummaryCard[] }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		function handleScroll() {
			if (!el) return;
			const cardWidth = el.scrollWidth / cards.length;
			const idx = Math.round(el.scrollLeft / cardWidth);
			setActiveIndex(Math.min(idx, cards.length - 1));
		}
		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, [cards.length]);

	function scrollTo(idx: number) {
		const el = scrollRef.current;
		if (!el) return;
		const cardWidth = el.scrollWidth / cards.length;
		el.scrollTo({ left: cardWidth * idx, behavior: "smooth" });
	}

	return (
		<div className="sm:hidden">
			<div
				ref={scrollRef}
				className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
				>
				{cards.map((card) => (
					<div key={card.label} className="w-full shrink-0 snap-center px-1">
						<div className="h-full">
							<CardContent card={card} />
						</div>
					</div>
				))}
			</div>
			{cards.length > 1 && (
				<div className="mt-3 flex justify-center gap-1.5">
					{cards.map((card, i) => (
						<button
							key={card.label}
							onClick={() => scrollTo(i)}
							aria-label={`Go to card ${i + 1}`}
							className={`h-1.5 rounded-full transition-all duration-200 ${
								i === activeIndex
									? "w-4 bg-accent"
									: "w-1.5 bg-content-faint/40"
							}`}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default function SummaryCards({ cards }: { cards: SummaryCard[] }) {
	return (
		<>
			<MobileCarousel cards={cards} />

			{/* Desktop: grid layout */}
			<div
				className={`hidden gap-4 sm:grid ${
					cards.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"
				}`}
			>
				{cards.map((card) => (
					<CardContent key={card.label} card={card} />
				))}
			</div>
		</>
	);
}
