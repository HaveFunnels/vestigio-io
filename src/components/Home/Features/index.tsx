/**
 * Home > Features ("How Vestigio works") — bento grid.
 *
 * Replaces the legacy 6-card uniform grid with an asymmetric 4-card bento
 * that mirrors the dashboard's design vocabulary. Every card maps to one
 * of Vestigio's four product promises:
 *
 *   1. Action Queue          → "Prioritize fixes"           (amber)
 *   2. Revenue Leaks         → "Find what's bleeding"       (red)
 *   3. Continuous Watch      → "Recover the bleed"          (emerald)
 *   4. Evidence Verification → "Verify, don't guess"        (sky)
 *
 *   +-------------+-------------+----------+
 *   |  Card 1     |  Card 2     |  Card 4  |
 *   |  Action Q   |  Revenue    |  Evidence|
 *   |             |  Leaks      |  Orbit   |
 *   +-------------+-------------+  (tall)  |
 *   |       Card 3 — Continuous Watch      |
 *   +-------------+-------------+----------+
 *
 * Mobile: every card stacks. Tablet (sm-lg): 2-col uniform reflow.
 * Desktop (lg+): the asymmetric bento takes over.
 *
 * All copy is i18n-driven (`homepage.features_bento.*`). The component
 * is an async server component using `getTranslations` so it can stay
 * out of the client bundle.
 *
 * Animations are CSS-keyframe-only (no JS) so the file remains a server
 * component. Keyframes are inlined via a `<style>` block at the bottom
 * with a `vbento-` prefix to avoid global collisions.
 */

import { getTranslations } from "next-intl/server";

/* ──────────────────────────────────────────────────────────────────────────
 * SVG helpers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Build a smooth SVG path through a list of points using a Catmull-Rom-to-
 * cubic-Bezier conversion. Produces continuous curves with no kinks.
 */
function smoothPath(points: [number, number][]): string {
	if (points.length < 2) return "";
	let d = `M ${points[0][0]} ${points[0][1]}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] || points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] || p2;
		const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
		const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
		const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
		const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
		d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
	}
	return d;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Surface icons (used by Revenue Leaks card)
 * ────────────────────────────────────────────────────────────────────────── */

const surfaceIconByOrder = [
	// Checkout
	(
		<svg viewBox='0 0 24 24' fill='none' className='h-4 w-4'>
			<path
				d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 5h12.5'
				stroke='currentColor'
				strokeWidth='1.5'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
			<circle cx='9' cy='20' r='1.5' stroke='currentColor' strokeWidth='1.5' />
			<circle cx='17' cy='20' r='1.5' stroke='currentColor' strokeWidth='1.5' />
		</svg>
	),
	// Pricing tag
	(
		<svg viewBox='0 0 24 24' fill='none' className='h-4 w-4'>
			<path
				d='M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.6-7.6V4h9l8.6 8.6a2 2 0 010 2.8z'
				stroke='currentColor'
				strokeWidth='1.5'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
			<circle cx='8' cy='8' r='1.5' fill='currentColor' />
		</svg>
	),
	// Onboarding
	(
		<svg viewBox='0 0 24 24' fill='none' className='h-4 w-4'>
			<path
				d='M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2'
				stroke='currentColor'
				strokeWidth='1.5'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
			<circle cx='9' cy='7' r='4' stroke='currentColor' strokeWidth='1.5' />
			<path
				d='M19 8v6M16 11h6'
				stroke='currentColor'
				strokeWidth='1.5'
				strokeLinecap='round'
			/>
		</svg>
	),
];

/* ──────────────────────────────────────────────────────────────────────────
 * Card 1 — Action Queue
 * ────────────────────────────────────────────────────────────────────────── */

interface ActionRow {
	title: string;
	impact: string;
}

const ROW_DOTS = ["bg-red-400", "bg-amber-400", "bg-amber-400", "bg-yellow-400"];

const ActionQueueVisual = ({ rows }: { rows: ActionRow[] }) => (
	<div className='space-y-1'>
		{rows.map((row, i) => (
			<div
				key={i}
				className='flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.015] px-3 py-1.5 transition-all duration-300 group-hover:translate-x-0.5 group-hover:border-amber-500/15 group-hover:bg-white/[0.025]'
				style={{ transitionDelay: `${i * 40}ms` }}
			>
				<span className='font-mono text-[10px] tabular-nums text-zinc-500'>
					{String(i + 1).padStart(2, "0")}
				</span>
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROW_DOTS[i] || "bg-zinc-400"}`}
				/>
				<span className='flex-1 truncate text-[11px] font-medium text-zinc-200 sm:text-xs'>
					{row.title}
				</span>
				<span className='font-mono text-[10px] tabular-nums text-red-400 sm:text-xs'>
					{row.impact}
				</span>
			</div>
		))}
	</div>
);

/* ──────────────────────────────────────────────────────────────────────────
 * Card 2 — Revenue Leaks
 * ────────────────────────────────────────────────────────────────────────── */

interface LeakRow {
	surface: string;
	loss: string;
	confidence: string;
}

const RevenueLeaksVisual = ({
	rows,
	confidenceLabel,
	leakingLabel,
}: {
	rows: LeakRow[];
	confidenceLabel: string;
	leakingLabel: string;
}) => (
	<div className='space-y-1.5'>
		{rows.map((row, i) => (
			<div
				key={i}
				className='flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2 transition-all duration-300 group-hover:-translate-x-0.5 group-hover:border-red-500/20 group-hover:bg-white/[0.04] lg:gap-3 lg:px-3'
				style={{ transitionDelay: `${i * 60}ms` }}
			>
				<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-red-500/15'>
					{surfaceIconByOrder[i]}
				</div>
				<div className='min-w-0 flex-1'>
					<div className='truncate text-[11px] font-medium text-zinc-200'>
						{row.surface}
					</div>
					<div className='mt-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500'>
						{confidenceLabel} {row.confidence}
					</div>
				</div>
				<div className='shrink-0 font-mono text-[11px] tabular-nums text-red-400 lg:text-sm'>
					{row.loss}
				</div>
				<span className='hidden shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-red-300 xl:inline-block'>
					{leakingLabel}
				</span>
			</div>
		))}
	</div>
);

/* ──────────────────────────────────────────────────────────────────────────
 * Card 3 — Continuous Watch (before/after revenue-leak chart)
 *
 * Reference: Chargeflow's "Dispute Rate Reduced By −87.2%" graphic.
 * Shows a dashed gray "before Vestigio" curve climbing to a peak, a
 * diamond marker at the inflection point, and an emerald solid area
 * curve descending after the marker. Big "−87.2%" annotation top-right.
 * ────────────────────────────────────────────────────────────────────────── */

const ContinuousWatchVisual = ({
	axisLabel,
	beforeLabel,
	afterLabel,
	annotationLabel,
	annotationValue,
}: {
	axisLabel: string;
	beforeLabel: string;
	afterLabel: string;
	annotationLabel: string;
	annotationValue: string;
}) => {
	const W = 480;
	const H = 170;
	const PAD_X = 16;
	const PAD_TOP = 24; // leave room for the label up top
	const PAD_BOTTOM = 22; // leave room for the before/after labels
	const innerW = W - PAD_X * 2;
	const innerH = H - PAD_TOP - PAD_BOTTOM;
	const baseY = PAD_TOP + innerH;

	// Y mapping: lower y value = higher revenue lost (chart climbs up)
	const yAt = (frac: number) => PAD_TOP + innerH * frac;

	// BEFORE curve — flat-high "stable chronic loss" line with mild
	// natural wobble. Hovers around frac 0.16-0.22 (near top of chart =
	// high revenue lost) for the entire left half. The story this tells
	// is "leakage was constantly bleeding you" — not "leakage was
	// growing".
	const beforePoints: [number, number][] = [
		[PAD_X + innerW * 0.0, yAt(0.18)],
		[PAD_X + innerW * 0.07, yAt(0.21)],
		[PAD_X + innerW * 0.14, yAt(0.16)],
		[PAD_X + innerW * 0.21, yAt(0.2)],
		[PAD_X + innerW * 0.28, yAt(0.17)],
		[PAD_X + innerW * 0.35, yAt(0.22)],
		[PAD_X + innerW * 0.42, yAt(0.18)],
		[PAD_X + innerW * 0.5, yAt(0.2)], // inflection
	];

	const peak = beforePoints[beforePoints.length - 1];

	// AFTER curve — descends from inflection with realistic peaks/valleys
	// down to a low frac (~0.78) representing recovered revenue.
	const afterPoints: [number, number][] = [
		peak,
		[PAD_X + innerW * 0.55, yAt(0.34)],
		[PAD_X + innerW * 0.6, yAt(0.42)],
		[PAD_X + innerW * 0.65, yAt(0.36)],
		[PAD_X + innerW * 0.7, yAt(0.5)],
		[PAD_X + innerW * 0.75, yAt(0.55)],
		[PAD_X + innerW * 0.8, yAt(0.65)],
		[PAD_X + innerW * 0.85, yAt(0.62)],
		[PAD_X + innerW * 0.9, yAt(0.74)],
		[PAD_X + innerW * 0.95, yAt(0.71)],
		[PAD_X + innerW * 1.0, yAt(0.8)],
	];

	const beforePath = smoothPath(beforePoints);
	const afterLinePath = smoothPath(afterPoints);
	// Area path: line + close to baseline
	const afterAreaPath = `${afterLinePath} L ${afterPoints[afterPoints.length - 1][0]} ${baseY} L ${peak[0]} ${baseY} Z`;

	// Diamond marker at the inflection — rotate a small square 45deg
	const peakX = peak[0];
	const peakY = peak[1];

	return (
		<div className='relative aspect-[480/170] w-full'>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className='h-full w-full overflow-visible'
				preserveAspectRatio='xMidYMid meet'
			>
				<defs>
					<linearGradient
						id='vbento-area-gradient'
						x1='0'
						y1='0'
						x2='0'
						y2='1'
					>
						<stop offset='0%' stopColor='rgba(16,185,129,0.45)' />
						<stop offset='60%' stopColor='rgba(16,185,129,0.1)' />
						<stop offset='100%' stopColor='rgba(16,185,129,0)' />
					</linearGradient>
				</defs>

				{/* Baseline rule */}
				<line
					x1={PAD_X}
					y1={baseY}
					x2={W - PAD_X}
					y2={baseY}
					stroke='rgba(255,255,255,0.06)'
					strokeWidth='1'
				/>

				{/* Subtle horizontal grid */}
				{[0.25, 0.5, 0.75].map((frac, i) => (
					<line
						key={i}
						x1={PAD_X}
						y1={yAt(frac)}
						x2={W - PAD_X}
						y2={yAt(frac)}
						stroke='rgba(255,255,255,0.025)'
						strokeWidth='1'
						strokeDasharray='2 4'
					/>
				))}

				{/* BEFORE curve — dashed gray */}
				<path
					d={beforePath}
					fill='none'
					stroke='rgba(255,255,255,0.35)'
					strokeWidth='2'
					strokeLinecap='round'
					strokeDasharray='4 4'
				/>

				{/* AFTER area — emerald gradient fill */}
				<path d={afterAreaPath} fill='url(#vbento-area-gradient)' />

				{/* AFTER line — emerald solid */}
				<path
					d={afterLinePath}
					fill='none'
					stroke='#10b981'
					strokeWidth='2'
					strokeLinecap='round'
					strokeLinejoin='round'
				/>

				{/* Inflection diamond marker */}
				<g transform={`rotate(45 ${peakX} ${peakY})`}>
					<rect
						x={peakX - 7}
						y={peakY - 7}
						width='14'
						height='14'
						fill='#10b981'
						stroke='#0a0f0a'
						strokeWidth='2'
					/>
				</g>
				{/* Soft halo around the diamond */}
				<circle
					cx={peakX}
					cy={peakY}
					r='14'
					fill='none'
					stroke='rgba(16,185,129,0.25)'
					strokeWidth='1'
				/>

				{/* Y-axis label (top-left) */}
				<text
					x={PAD_X}
					y={PAD_TOP - 12}
					fontSize='10'
					fill='rgba(255,255,255,0.55)'
					fontFamily='ui-sans-serif, system-ui'
				>
					{axisLabel}
				</text>

				{/* Before label */}
				<text
					x={PAD_X + innerW * 0.25}
					y={H - 6}
					fontSize='9'
					fill='rgba(255,255,255,0.4)'
					textAnchor='middle'
					fontFamily='ui-sans-serif, system-ui'
					letterSpacing='0.06em'
				>
					{beforeLabel.toUpperCase()}
				</text>

				{/* After label */}
				<text
					x={PAD_X + innerW * 0.75}
					y={H - 6}
					fontSize='9'
					fill='rgba(110,231,183,0.65)'
					textAnchor='middle'
					fontFamily='ui-sans-serif, system-ui'
					letterSpacing='0.06em'
				>
					{afterLabel.toUpperCase()}
				</text>

				{/* Vertical separator at the inflection */}
				<line
					x1={peakX}
					y1={baseY}
					x2={peakX}
					y2={baseY + 8}
					stroke='rgba(16,185,129,0.4)'
					strokeWidth='1'
				/>
			</svg>

			{/* Annotation pill — positioned top-right of the chart area, HTML
			    instead of SVG so it inherits Tailwind colors and the dashboard's
			    eyebrow/value vocabulary. */}
			<div className='pointer-events-none absolute right-3 top-1 flex flex-col items-end text-right'>
				<span className='text-[9px] font-medium uppercase tracking-[0.14em] text-emerald-300/80'>
					{annotationLabel}
				</span>
				<span
					className='font-mono text-2xl font-semibold tabular-nums tracking-tight text-emerald-400 sm:text-3xl'
					style={{
						textShadow:
							"0 8px 24px rgba(16,185,129,0.35), 0 2px 8px rgba(16,185,129,0.2)",
					}}
				>
					{annotationValue}
				</span>
			</div>
		</div>
	);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card 4 — Evidence Verification (animated orbital diagram)
 *
 * Vertical bob on the whole graphic, slow rotation on the outer dashed
 * ring, opposing rotation on the inner ring, pulsing center node, and a
 * stagger reveal on the evidence pills. All animations are CSS-only.
 * ────────────────────────────────────────────────────────────────────────── */

const EVIDENCE_KEYS = [
	"browser",
	"static",
	"behavioral",
	"cross_source",
	"vendor",
	"timestamped",
] as const;

const EvidenceOrbitVisual = ({
	centerLabel,
	types,
}: {
	centerLabel: string;
	types: Record<string, string>;
}) => {
	const SIZE = 280;
	const center = SIZE / 2;
	const r1 = 70;
	const r2 = 110;

	const polar = (r: number, angleDeg: number) => {
		const a = (angleDeg - 90) * (Math.PI / 180);
		return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
	};

	// Build evidence nodes from translated labels
	const evidence = EVIDENCE_KEYS.map((key, i) => ({
		label: types[key] || key,
		angle: i * 60,
	}));

	return (
		<div
			className='relative mx-auto aspect-square w-full max-w-[340px]'
			style={{
				animation: "vbento-bob 6s ease-in-out infinite",
			}}
		>
			<svg
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className='h-full w-full overflow-visible'
			>
				<defs>
					<radialGradient id='vbento-orbit-glow' cx='50%' cy='50%' r='50%'>
						<stop offset='0%' stopColor='rgba(56,189,248,0.22)' />
						<stop offset='60%' stopColor='rgba(56,189,248,0.05)' />
						<stop offset='100%' stopColor='rgba(56,189,248,0)' />
					</radialGradient>
				</defs>

				{/* Pulsing center glow */}
				<circle
					cx={center}
					cy={center}
					r={r2 + 20}
					fill='url(#vbento-orbit-glow)'
					style={{
						transformOrigin: `${center}px ${center}px`,
						animation: "vbento-pulse-glow 4s ease-in-out infinite",
					}}
				/>

				{/* Outer dashed ring — slow clockwise rotation */}
				<g
					style={{
						transformOrigin: `${center}px ${center}px`,
						animation: "vbento-spin-cw 60s linear infinite",
					}}
				>
					<circle
						cx={center}
						cy={center}
						r={r2}
						fill='none'
						stroke='rgba(56,189,248,0.22)'
						strokeWidth='1'
						strokeDasharray='2 4'
					/>
					{/* Outer ring tick marks at the 6 evidence positions */}
					{evidence.map((e, i) => {
						const p = polar(r2, e.angle);
						return (
							<circle
								key={i}
								cx={p.x}
								cy={p.y}
								r='1.5'
								fill='rgba(56,189,248,0.5)'
							/>
						);
					})}
				</g>

				{/* Inner ring — opposing rotation */}
				<g
					style={{
						transformOrigin: `${center}px ${center}px`,
						animation: "vbento-spin-ccw 80s linear infinite",
					}}
				>
					<circle
						cx={center}
						cy={center}
						r={r1}
						fill='none'
						stroke='rgba(56,189,248,0.3)'
						strokeWidth='1'
					/>
					{evidence.map((e, i) => {
						const p = polar(r1, e.angle + 30);
						return (
							<circle
								key={i}
								cx={p.x}
								cy={p.y}
								r='2.5'
								fill='rgba(56,189,248,0.55)'
							/>
						);
					})}
				</g>

				{/* Connection lines from center to evidence nodes */}
				{evidence.map((e, i) => {
					const p = polar(r2, e.angle);
					return (
						<line
							key={i}
							x1={center}
							y1={center}
							x2={p.x}
							y2={p.y}
							stroke='rgba(56,189,248,0.12)'
							strokeWidth='1'
						/>
					);
				})}

				{/* Center node — base */}
				<circle
					cx={center}
					cy={center}
					r='28'
					fill='#0a0f1a'
					stroke='rgba(56,189,248,0.55)'
					strokeWidth='1.5'
				/>
				{/* Center pulse ring (animated scale + opacity) */}
				<circle
					cx={center}
					cy={center}
					r='10'
					fill='none'
					stroke='rgba(56,189,248,0.5)'
					strokeWidth='1'
					style={{
						transformOrigin: `${center}px ${center}px`,
						animation: "vbento-center-pulse 3s ease-in-out infinite",
					}}
				/>
				<circle cx={center} cy={center} r='6' fill='rgba(56,189,248,0.95)' />

				{/* Outer evidence pills — stagger fade-in + gentle bob */}
				{evidence.map((e, i) => {
					const p = polar(r2, e.angle);
					const labelWidth = e.label.length * 6 + 18;
					return (
						<g
							key={i}
							style={{
								transformOrigin: `${p.x}px ${p.y}px`,
								animation: `vbento-pill-bob ${3 + (i % 3) * 0.4}s ease-in-out ${i * 0.3}s infinite, vbento-fade-in 0.8s ease-out ${0.2 + i * 0.1}s both`,
							}}
						>
							<rect
								x={p.x - labelWidth / 2}
								y={p.y - 9}
								width={labelWidth}
								height='18'
								rx='9'
								fill='#0a0f1a'
								stroke='rgba(56,189,248,0.42)'
								strokeWidth='1'
							/>
							<text
								x={p.x}
								y={p.y + 3.5}
								textAnchor='middle'
								fontSize='9'
								fontWeight='500'
								fill='rgba(186,230,253,0.95)'
								fontFamily='ui-sans-serif, system-ui'
							>
								{e.label}
							</text>
						</g>
					);
				})}
			</svg>

			{/* Center label — sits below the central node */}
			<div className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-12 text-center'>
				<div className='text-[9px] uppercase tracking-[0.18em] text-sky-300/70'>
					{centerLabel}
				</div>
			</div>
		</div>
	);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card chrome — shared wrapper with idle gradient + dramatic hover lift
 * ────────────────────────────────────────────────────────────────────────── */

type Accent = "amber" | "red" | "emerald" | "sky";

const accentConfig: Record<
	Accent,
	{
		dot: string;
		eyebrow: string;
		gradient: string;
		hoverBorder: string;
		hoverShadow: string;
		topAccent: string;
	}
> = {
	amber: {
		dot: "bg-amber-400",
		eyebrow: "text-amber-300/90",
		gradient: "from-amber-500/[0.08] via-transparent to-transparent",
		hoverBorder: "group-hover:border-amber-500/40",
		hoverShadow:
			"group-hover:shadow-[0_18px_50px_-18px_rgba(245,158,11,0.55)]",
		topAccent: "bg-amber-400",
	},
	red: {
		dot: "bg-red-400",
		eyebrow: "text-red-300/90",
		gradient: "from-red-500/[0.08] via-transparent to-transparent",
		hoverBorder: "group-hover:border-red-500/40",
		hoverShadow:
			"group-hover:shadow-[0_18px_50px_-18px_rgba(239,68,68,0.55)]",
		topAccent: "bg-red-400",
	},
	emerald: {
		dot: "bg-emerald-400",
		eyebrow: "text-emerald-300/90",
		gradient: "from-emerald-500/[0.08] via-transparent to-transparent",
		hoverBorder: "group-hover:border-emerald-500/40",
		hoverShadow:
			"group-hover:shadow-[0_18px_50px_-18px_rgba(16,185,129,0.55)]",
		topAccent: "bg-emerald-400",
	},
	sky: {
		dot: "bg-sky-400",
		eyebrow: "text-sky-300/90",
		gradient: "from-sky-500/[0.08] via-transparent to-transparent",
		hoverBorder: "group-hover:border-sky-500/40",
		hoverShadow:
			"group-hover:shadow-[0_18px_50px_-18px_rgba(56,189,248,0.55)]",
		topAccent: "bg-sky-400",
	},
};

interface BentoCardProps {
	accent: Accent;
	eyebrow: string;
	title: string;
	description: string;
	className?: string;
	visualSlot: React.ReactNode;
	layout?: "stacked" | "horizontal";
}

const BentoCard = ({
	accent,
	eyebrow,
	title,
	description,
	className = "",
	visualSlot,
	layout = "stacked",
}: BentoCardProps) => {
	const a = accentConfig[accent];

	const innerLayout =
		layout === "horizontal"
			? "flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6"
			: "flex flex-col gap-4";

	return (
		<div
			className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-white/20 sm:p-6 ${a.hoverBorder} ${a.hoverShadow} ${className}`}
		>
			{/* Top accent bar — invisible at idle, slides in on hover */}
			<div
				className={`pointer-events-none absolute left-0 right-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 ${a.topAccent}`}
				aria-hidden
			/>

			{/* Idle accent gradient — visible, brightens on hover */}
			<div
				className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${a.gradient} opacity-70 transition-opacity duration-500 group-hover:opacity-100`}
				aria-hidden
			/>

			{/* Inner highlight border */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all duration-500 group-hover:ring-white/[0.08]'
				aria-hidden
			/>

			<div className={`relative ${innerLayout} h-full`}>
				{/* Visual zone.
				    Stacked: content-sized at top of card.
				    Horizontal: takes left column, flex container that
				    centers the chart vertically + horizontally so it
				    sits in the middle of the stretched column. */}
				<div
					className={
						layout === "horizontal"
							? "lg:flex lg:flex-1 lg:items-center lg:justify-center"
							: ""
					}
				>
					{visualSlot}
				</div>

				{/* Caption strip with min-height so all captions in the same
				    row have the same block height — eyebrow lands at the
				    same Y across cards, titles align.
				    Stacked: mt-auto pushes block to card bottom.
				    Horizontal: caption is the right column, vertically
				    centered inside its stretched column. */}
				<div
					className={
						layout === "horizontal"
							? "lg:flex lg:min-h-[156px] lg:max-w-[280px] lg:flex-col lg:justify-center"
							: "mt-auto min-h-[156px]"
					}
				>
					<div className='mb-2 flex items-center gap-2'>
						<span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
						<span
							className={`text-[10px] font-medium uppercase tracking-[0.16em] ${a.eyebrow}`}
						>
							{eyebrow}
						</span>
					</div>
					<h3 className='mb-1.5 text-base font-semibold tracking-tight text-white sm:text-lg'>
						{title}
					</h3>
					<p className='line-clamp-5 text-[13px] leading-relaxed text-zinc-400 sm:text-sm'>
						{description}
					</p>
				</div>
			</div>
		</div>
	);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Section
 * ────────────────────────────────────────────────────────────────────────── */

const Features = async () => {
	const t = await getTranslations("homepage.features_bento");

	const actionRows = t.raw("action_queue.rows") as ActionRow[];
	const leakRows = t.raw("revenue_leaks.rows") as LeakRow[];
	const evidenceTypes = t.raw("evidence_orbit.evidence_types") as Record<
		string,
		string
	>;

	return (
		<section
			id='features'
			className='relative z-1 overflow-hidden border-t border-white/5 bg-[#090911] py-8 sm:py-10 lg:py-14'
		>
			{/* Component-scoped keyframes. Prefixed with `vbento-` so they
			    can't collide with other animations elsewhere in the app.
			    Server-component-friendly: no JS, no client hydration cost. */}
			<style>{`
				@keyframes vbento-spin-cw {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
				@keyframes vbento-spin-ccw {
					from { transform: rotate(0deg); }
					to { transform: rotate(-360deg); }
				}
				@keyframes vbento-pulse-glow {
					0%, 100% { transform: scale(1); opacity: 0.85; }
					50% { transform: scale(1.08); opacity: 1; }
				}
				@keyframes vbento-center-pulse {
					0%, 100% { transform: scale(1); opacity: 0.5; }
					50% { transform: scale(1.5); opacity: 0; }
				}
				@keyframes vbento-bob {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-6px); }
				}
				@keyframes vbento-pill-bob {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-2px); }
				}
				@keyframes vbento-fade-in {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@media (prefers-reduced-motion: reduce) {
					.vbento-anim, [style*="vbento-"] {
						animation: none !important;
					}
				}
			`}</style>

			{/* Soft ambient glow */}
			<div
				className='pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-900/[0.08] blur-[120px]'
				aria-hidden
			/>

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				{/* Header */}
				<div className='mx-auto mb-8 max-w-[680px] text-center sm:mb-10'>
					<div className='mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1'>
						<span className='h-1.5 w-1.5 rounded-full bg-emerald-400' />
						<span className='text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300/90'>
							{t("eyebrow")}
						</span>
					</div>
					<h2 className='mb-3 text-xl font-bold leading-[1.15] tracking-tight text-white sm:text-2xl lg:text-3xl'>
						{t("title_part1")}{" "}
						<span className='text-zinc-500'>{t("title_part2")}</span>
					</h2>
					<p className='mx-auto max-w-[560px] text-sm leading-relaxed text-zinc-400 sm:text-[15px]'>
						{t("subtitle")}
					</p>
				</div>

				{/* Bento grid — auto rows so row 2 (Card 3 horizontal) is
				    naturally shorter than row 1 (Cards 1, 2 stacked). This
				    is the trick to remove dead space from Cards 3 and 4
				    without forcing equal-height rows. */}
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:grid-rows-[auto_auto]'>
					{/* Mobile order: 1-audita 2-diagnostica 3-prioriza 4-recupera
					     Desktop: original bento grid positions via lg:col/row */}
					<BentoCard
						accent='amber'
						eyebrow={t("action_queue.eyebrow")}
						title={t("action_queue.title")}
						description={t("action_queue.description")}
						className='order-3 lg:order-none lg:col-start-1 lg:row-start-1'
						visualSlot={<ActionQueueVisual rows={actionRows} />}
					/>

					<BentoCard
						accent='red'
						eyebrow={t("revenue_leaks.eyebrow")}
						title={t("revenue_leaks.title")}
						description={t("revenue_leaks.description")}
						className='order-2 lg:order-none lg:col-start-2 lg:row-start-1'
						visualSlot={
							<RevenueLeaksVisual
								rows={leakRows}
								confidenceLabel={t("revenue_leaks.confidence_label")}
								leakingLabel={t("revenue_leaks.leaking_label")}
							/>
						}
					/>

					<BentoCard
						accent='emerald'
						eyebrow={t("continuous_watch.eyebrow")}
						title={t("continuous_watch.title")}
						description={t("continuous_watch.description")}
						className='order-4 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-2'
						layout='horizontal'
						visualSlot={
							<ContinuousWatchVisual
								axisLabel={t("continuous_watch.axis_label")}
								beforeLabel={t("continuous_watch.before_label")}
								afterLabel={t("continuous_watch.after_label")}
								annotationLabel={t("continuous_watch.annotation_label")}
								annotationValue={t("continuous_watch.annotation_value")}
							/>
						}
					/>

					<BentoCard
						accent='sky'
						eyebrow={t("evidence_orbit.eyebrow")}
						title={t("evidence_orbit.title")}
						description={t("evidence_orbit.description")}
						className='order-1 lg:order-none lg:col-start-3 lg:row-span-2'
						visualSlot={
							<EvidenceOrbitVisual
								centerLabel={t("evidence_orbit.center_label")}
								types={evidenceTypes}
							/>
						}
					/>
				</div>
			</div>
		</section>
	);
};

export default Features;
