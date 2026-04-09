/**
 * Home > Features ("How Vestigio works") — bento grid.
 *
 * Replaces the legacy 6-card uniform grid with an asymmetric 4-card bento
 * that mirrors the dashboard's design vocabulary (eyebrow + dot, JetBrains
 * Mono on numbers, colored shadows on hover, gradient highlight overlays,
 * negative-loss values in red).
 *
 * Each card maps to one of Vestigio's four product promises:
 *   1. Action Queue          → "Prioritize fixes"           (amber)
 *   2. Revenue Leaks         → "Find what's bleeding"       (red)
 *   3. Continuous Watch      → "Catch regressions"          (emerald)
 *   4. Evidence Verification → "Verify, don't guess"        (sky)
 *
 * The bento layout:
 *
 *   +-------------+-------------+----------+
 *   |  Card 1     |  Card 2     |  Card 4  |
 *   |  Action Q   |  Revenue    |  Evidence|
 *   |             |  Leaks      |  Orbit   |
 *   +-------------+-------------+  (tall)  |
 *   |       Card 3 — Continuous Watch      |
 *   +-------------+-------------+----------+
 *
 * On mobile (< sm) every card stacks. On tablet (sm-lg) cards reflow into
 * a 2-col layout. On desktop (lg+) the asymmetric bento takes over.
 */

const surfaceIcon = {
	checkout: (
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
	pricing: (
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
	onboarding: (
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
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card 1 — Action Queue (amber)
 * ────────────────────────────────────────────────────────────────────────── */
const actionQueueRows = [
	{
		rank: "01",
		severity: "critical",
		dot: "bg-red-400",
		title: "Checkout abandons spike",
		impact: "−$8,420",
	},
	{
		rank: "02",
		severity: "high",
		dot: "bg-amber-400",
		title: "Form trust gap",
		impact: "−$3,150",
	},
	{
		rank: "03",
		severity: "high",
		dot: "bg-amber-400",
		title: "Pricing confusion",
		impact: "−$1,920",
	},
	{
		rank: "04",
		severity: "medium",
		dot: "bg-yellow-400",
		title: "Onboarding drop-off",
		impact: "−$1,140",
	},
];

const ActionQueueVisual = () => (
	<div className='space-y-1.5'>
		{actionQueueRows.map((row, i) => (
			<div
				key={row.rank}
				className='flex items-center gap-3 rounded-[0.625rem] border border-white/5 bg-white/[0.015] px-3 py-2 transition-all duration-300 group-hover:border-white/10'
				style={{ transitionDelay: `${i * 30}ms` }}
			>
				<span className='font-mono text-[10px] tabular-nums text-zinc-500'>
					{row.rank}
				</span>
				<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.dot}`} />
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
 * Card 2 — Revenue Leaks (red)
 * ────────────────────────────────────────────────────────────────────────── */
const leakRows = [
	{
		icon: surfaceIcon.checkout,
		surface: "Checkout funnel",
		loss: "−$8,420",
		confidence: "94%",
	},
	{
		icon: surfaceIcon.pricing,
		surface: "Pricing page",
		loss: "−$3,150",
		confidence: "88%",
	},
	{
		icon: surfaceIcon.onboarding,
		surface: "Onboarding flow",
		loss: "−$1,920",
		confidence: "91%",
	},
];

const RevenueLeaksVisual = () => (
	<div className='space-y-2'>
		{leakRows.map((row, i) => (
			<div
				key={row.surface}
				className='flex items-center gap-3 rounded-[0.625rem] border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-all duration-300 group-hover:border-red-500/15'
				style={{ transitionDelay: `${i * 40}ms` }}
			>
				<div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400'>
					{row.icon}
				</div>
				<div className='min-w-0 flex-1'>
					<div className='truncate text-[11px] font-medium text-zinc-200 sm:text-xs'>
						{row.surface}
					</div>
					<div className='mt-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]'>
						confidence {row.confidence}
					</div>
				</div>
				<div className='font-mono text-xs tabular-nums text-red-400 sm:text-sm'>
					{row.loss}
				</div>
				<span className='hidden rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-red-300 sm:inline-block'>
					Leaking
				</span>
			</div>
		))}
	</div>
);

/* ──────────────────────────────────────────────────────────────────────────
 * Card 3 — Continuous Watch (emerald)
 * Multi-line sparkline with regression marker on the dipping line.
 * ────────────────────────────────────────────────────────────────────────── */
const ContinuousWatchVisual = () => {
	// Three trend series across 16 cycles. Cycle index 11 has a sharp dip
	// on the first series — that's where the regression marker lives.
	const W = 320;
	const H = 90;
	const PAD_X = 4;
	const PAD_Y = 8;

	const series = [
		{
			color: "#10b981", // emerald-500 — the regressing series
			values: [62, 64, 63, 66, 65, 68, 67, 70, 71, 72, 70, 38, 40, 42, 44, 46],
		},
		{
			color: "#34d399", // emerald-400
			values: [40, 42, 44, 43, 46, 48, 47, 50, 52, 54, 56, 58, 60, 61, 63, 64],
		},
		{
			color: "#6ee7b7", // emerald-300
			values: [25, 26, 28, 30, 32, 33, 35, 36, 38, 40, 41, 43, 44, 46, 48, 50],
		},
	];

	const xStep = (W - PAD_X * 2) / (series[0].values.length - 1);
	const minVal = 20;
	const maxVal = 80;
	const yScale = (v: number) =>
		PAD_Y + (1 - (v - minVal) / (maxVal - minVal)) * (H - PAD_Y * 2);

	const toPath = (values: number[]) =>
		values
			.map((v, i) => `${i === 0 ? "M" : "L"} ${PAD_X + i * xStep} ${yScale(v)}`)
			.join(" ");

	// Regression marker on series[0] at index 11 (the dip).
	const regressionX = PAD_X + 11 * xStep;
	const regressionY = yScale(series[0].values[11]);

	return (
		<div className='relative h-full w-full'>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className='h-full w-full overflow-visible'
				preserveAspectRatio='none'
			>
				{/* Subtle grid */}
				{[0, 1, 2, 3].map((i) => (
					<line
						key={i}
						x1={PAD_X}
						y1={PAD_Y + (i * (H - PAD_Y * 2)) / 3}
						x2={W - PAD_X}
						y2={PAD_Y + (i * (H - PAD_Y * 2)) / 3}
						stroke='rgba(255,255,255,0.04)'
						strokeWidth='1'
					/>
				))}

				{/* Lines (background → foreground) */}
				{series
					.slice()
					.reverse()
					.map((s, i) => {
						const isPrimary = i === series.length - 1;
						return (
							<path
								key={i}
								d={toPath(s.values)}
								fill='none'
								stroke={s.color}
								strokeWidth={isPrimary ? 1.75 : 1.25}
								strokeLinecap='round'
								strokeLinejoin='round'
								opacity={isPrimary ? 1 : 0.55}
							/>
						);
					})}

				{/* Regression marker */}
				<circle
					cx={regressionX}
					cy={regressionY}
					r='6'
					fill='rgba(239,68,68,0.15)'
					stroke='rgba(239,68,68,0.5)'
					strokeWidth='1.5'
				/>
				<circle cx={regressionX} cy={regressionY} r='2' fill='#f87171' />
			</svg>

			{/* Regression annotation pill — positioned absolutely over the dip */}
			<div
				className='pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-red-500/40 bg-[#0f0a0a]/90 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-red-300 backdrop-blur-sm'
				style={{
					left: `${(regressionX / W) * 100}%`,
					top: `${(regressionY / H) * 100 - 14}%`,
					transform: "translateX(-50%)",
				}}
			>
				<span className='h-1 w-1 rounded-full bg-red-400' />
				Regression
			</div>
		</div>
	);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card 4 — Evidence Verification (sky/blue)
 * Orbital diagram: a center "Finding" node with evidence types orbiting.
 * ────────────────────────────────────────────────────────────────────────── */
const evidenceTypes = [
	{ label: "Browser", angle: 0 },
	{ label: "Static", angle: 60 },
	{ label: "Behavioral", angle: 120 },
	{ label: "Cross-source", angle: 180 },
	{ label: "Vendor", angle: 240 },
	{ label: "Timestamped", angle: 300 },
];

const EvidenceOrbitVisual = () => {
	const SIZE = 280;
	const center = SIZE / 2;
	const r1 = 70;
	const r2 = 110;

	const polar = (r: number, angleDeg: number) => {
		const a = (angleDeg - 90) * (Math.PI / 180);
		return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
	};

	return (
		<div className='relative aspect-square w-full'>
			<svg
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className='h-full w-full overflow-visible'
			>
				<defs>
					<radialGradient id='orbit-glow' cx='50%' cy='50%' r='50%'>
						<stop offset='0%' stopColor='rgba(56,189,248,0.18)' />
						<stop offset='60%' stopColor='rgba(56,189,248,0.04)' />
						<stop offset='100%' stopColor='rgba(56,189,248,0)' />
					</radialGradient>
				</defs>

				{/* Center glow */}
				<circle cx={center} cy={center} r={r2 + 20} fill='url(#orbit-glow)' />

				{/* Outer ring */}
				<circle
					cx={center}
					cy={center}
					r={r2}
					fill='none'
					stroke='rgba(56,189,248,0.18)'
					strokeWidth='1'
					strokeDasharray='2 4'
				/>
				{/* Inner ring */}
				<circle
					cx={center}
					cy={center}
					r={r1}
					fill='none'
					stroke='rgba(56,189,248,0.25)'
					strokeWidth='1'
				/>

				{/* Connection lines from center to evidence nodes */}
				{evidenceTypes.map((e, i) => {
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

				{/* Inner ring nodes (small) */}
				{evidenceTypes.map((e, i) => {
					const p = polar(r1, e.angle + 30);
					return (
						<circle
							key={i}
							cx={p.x}
							cy={p.y}
							r='2.5'
							fill='rgba(56,189,248,0.5)'
						/>
					);
				})}

				{/* Center finding node */}
				<circle
					cx={center}
					cy={center}
					r='28'
					fill='#0a0f1a'
					stroke='rgba(56,189,248,0.5)'
					strokeWidth='1.5'
				/>
				<circle
					cx={center}
					cy={center}
					r='6'
					fill='rgba(56,189,248,0.9)'
				/>
				<circle
					cx={center}
					cy={center}
					r='10'
					fill='none'
					stroke='rgba(56,189,248,0.4)'
					strokeWidth='1'
				/>

				{/* Outer evidence nodes — pills */}
				{evidenceTypes.map((e, i) => {
					const p = polar(r2, e.angle);
					const labelWidth = e.label.length * 6 + 16;
					return (
						<g
							key={i}
							className='transition-all duration-500'
							style={{ transformOrigin: `${center}px ${center}px` }}
						>
							{/* Pill background */}
							<rect
								x={p.x - labelWidth / 2}
								y={p.y - 9}
								width={labelWidth}
								height={18}
								rx={9}
								fill='#0a0f1a'
								stroke='rgba(56,189,248,0.4)'
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

			{/* Center label sitting under the central node */}
			<div className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-12 text-center'>
				<div className='text-[9px] uppercase tracking-[0.18em] text-sky-300/70'>
					Finding
				</div>
			</div>
		</div>
	);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Card chrome — shared wrapper with idle gradient + hover lift.
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
	}
> = {
	amber: {
		dot: "bg-amber-400",
		eyebrow: "text-amber-300/90",
		gradient: "from-amber-500/[0.06] via-transparent to-transparent",
		hoverBorder: "group-hover:border-amber-500/25",
		hoverShadow:
			"group-hover:shadow-[0_24px_60px_-30px_rgba(245,158,11,0.45)]",
	},
	red: {
		dot: "bg-red-400",
		eyebrow: "text-red-300/90",
		gradient: "from-red-500/[0.06] via-transparent to-transparent",
		hoverBorder: "group-hover:border-red-500/25",
		hoverShadow:
			"group-hover:shadow-[0_24px_60px_-30px_rgba(239,68,68,0.45)]",
	},
	emerald: {
		dot: "bg-emerald-400",
		eyebrow: "text-emerald-300/90",
		gradient: "from-emerald-500/[0.06] via-transparent to-transparent",
		hoverBorder: "group-hover:border-emerald-500/25",
		hoverShadow:
			"group-hover:shadow-[0_24px_60px_-30px_rgba(16,185,129,0.45)]",
	},
	sky: {
		dot: "bg-sky-400",
		eyebrow: "text-sky-300/90",
		gradient: "from-sky-500/[0.06] via-transparent to-transparent",
		hoverBorder: "group-hover:border-sky-500/25",
		hoverShadow:
			"group-hover:shadow-[0_24px_60px_-30px_rgba(56,189,248,0.45)]",
	},
};

interface BentoCardProps {
	accent: Accent;
	eyebrow: string;
	title: string;
	description: string;
	className?: string;
	visualSlot: React.ReactNode;
	/** Layout: visual on top + text below (default), or side-by-side horizontal. */
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
			? "flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8"
			: "flex flex-col gap-6";

	return (
		<div
			className={`group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-6 transition-all duration-500 hover:border-white/15 sm:p-7 ${a.hoverBorder} ${a.hoverShadow} ${className}`}
		>
			{/* Idle accent gradient — very subtle, brightens on hover */}
			<div
				className={`pointer-events-none absolute inset-0 rounded-[1.25rem] bg-gradient-to-br ${a.gradient} opacity-60 transition-opacity duration-500 group-hover:opacity-100`}
				aria-hidden
			/>
			{/* Inner highlight border */}
			<div
				className='pointer-events-none absolute inset-0 rounded-[1.25rem] ring-1 ring-inset ring-white/[0.04]'
				aria-hidden
			/>

			<div className={`relative ${innerLayout} h-full`}>
				{/* Visual zone */}
				<div
					className={
						layout === "horizontal"
							? "min-h-[120px] flex-1 lg:min-h-[140px]"
							: "min-h-[140px] flex-1"
					}
				>
					{visualSlot}
				</div>

				{/* Caption strip */}
				<div className={layout === "horizontal" ? "lg:max-w-[280px]" : ""}>
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
					<p className='text-[13px] leading-relaxed text-zinc-400 sm:text-sm'>
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
const Features = () => {
	return (
		<section
			id='features'
			className='relative z-1 overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20 lg:py-28 xl:py-32'
		>
			{/* Soft ambient glow */}
			<div
				className='pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-900/[0.08] blur-[120px]'
				aria-hidden
			/>

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				{/* Header */}
				<div className='mx-auto mb-10 max-w-[680px] text-center sm:mb-14'>
					<div className='mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1'>
						<span className='h-1.5 w-1.5 rounded-full bg-emerald-400' />
						<span className='text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300/90'>
							How Vestigio works
						</span>
					</div>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-[2.5rem]'>
						Stop guessing.{" "}
						<span className='text-zinc-500'>Start deciding.</span>
					</h2>
					<p className='mx-auto max-w-[560px] text-sm leading-relaxed text-zinc-400 sm:text-base'>
						Four answers, one decision engine. Find where you&apos;re losing
						money, fix what matters first, verify with evidence, and catch
						regressions before they cost you.
					</p>
				</div>

				{/* Bento grid */}
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:grid-rows-2'>
					{/* Card 1 — Action Queue (top-left) */}
					<BentoCard
						accent='amber'
						eyebrow='Prioritize'
						title='A clear queue of what to fix first'
						description='Every finding ranked by impact, urgency, and effort. No more spreadsheets — just the next decision, ready to ship.'
						className='lg:col-start-1 lg:row-start-1'
						visualSlot={<ActionQueueVisual />}
					/>

					{/* Card 2 — Revenue Leaks (top-middle) */}
					<BentoCard
						accent='red'
						eyebrow='Diagnose'
						title='Find where money is bleeding'
						description='Vestigio quantifies every leak across your funnel — with confidence ranges, not vibes. Know what each broken surface is costing you.'
						className='lg:col-start-2 lg:row-start-1'
						visualSlot={<RevenueLeaksVisual />}
					/>

					{/* Card 3 — Continuous Watch (bottom-wide) */}
					<BentoCard
						accent='emerald'
						eyebrow='Monitor'
						title='Catch regressions before they cost you'
						description='Vestigio tracks every surface across cycles and flags what got worse since the last analysis. Silent deploys never stay silent.'
						className='lg:col-span-2 lg:col-start-1 lg:row-start-2'
						layout='horizontal'
						visualSlot={<ContinuousWatchVisual />}
					/>

					{/* Card 4 — Evidence Verification (right-tall) */}
					<BentoCard
						accent='sky'
						eyebrow='Verify'
						title='Every finding traces back to evidence'
						description='Browser-verified, cross-checked, timestamped. Vestigio enriches every finding with multi-source proof — so your team trusts the call.'
						className='lg:col-start-3 lg:row-span-2'
						visualSlot={<EvidenceOrbitVisual />}
					/>
				</div>
			</div>
		</section>
	);
};

export default Features;
