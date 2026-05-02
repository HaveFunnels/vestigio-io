"use client";

import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// "O problema" — bento grid with visceral graphics
//
// Layout: =| (2 stacked left, 1 tall right)
// Card 1 (top-left): "O ciclo" — shimmer looping through stages
// Card 2 (bottom-left): "O silêncio" — empty terminal
// Card 3 (right, tall): "O buraco" — coins draining through gap
//
// Visual language matches #features bento section:
// rounded-2xl, border-white/10, smooth SVG with gradients,
// hover lift with colored glow, stagger animations.
// ──────────────────────────────────────────────

// ── Accent config per card ──
const ACCENTS = [
	{
		border: "border-violet-500/20",
		hoverBorder: "group-hover:border-violet-500/40",
		hoverShadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(139,92,246,0.55)]",
		gradient: "from-violet-500/[0.08] via-transparent to-transparent",
		topAccent: "bg-violet-400",
		pill: "bg-violet-500/10 text-violet-400",
	},
	{
		border: "border-amber-500/20",
		hoverBorder: "group-hover:border-amber-500/40",
		hoverShadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(245,158,11,0.55)]",
		gradient: "from-amber-500/[0.08] via-transparent to-transparent",
		topAccent: "bg-amber-400",
		pill: "bg-amber-500/10 text-amber-400",
	},
	{
		border: "border-red-500/20",
		hoverBorder: "group-hover:border-red-500/40",
		hoverShadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(239,68,68,0.55)]",
		gradient: "from-red-500/[0.08] via-transparent to-transparent",
		topAccent: "bg-red-400",
		pill: "bg-red-500/10 text-red-400",
	},
] as const;

// ── Graphic 1: Cycle — shimmer looping through ring ──

function CycleGraphic({ stages }: { stages: string[] }) {
	const SIZE = 200;
	const center = SIZE / 2;
	const r = 65;

	// Stage positions: top, bottom-right, bottom-left (triangle)
	const positions = [
		{ x: center, y: center - r, label: stages[0] || "" },
		{ x: center + r * 0.87, y: center + r * 0.5, label: stages[2] || "" },
		{ x: center - r * 0.87, y: center + r * 0.5, label: stages[1] || "" },
	];

	return (
		<div className="flex items-center justify-center py-4">
			<svg width="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-[200px] sm:max-w-[220px]">
				<defs>
					<linearGradient id="cycle-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="rgba(139,92,246,0)" />
						<stop offset="40%" stopColor="rgba(139,92,246,0.6)" />
						<stop offset="60%" stopColor="rgba(167,139,250,0.8)" />
						<stop offset="100%" stopColor="rgba(139,92,246,0)" />
						<animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3s" repeatCount="indefinite" />
					</linearGradient>
					<radialGradient id="cycle-glow" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor="rgba(139,92,246,0.12)" />
						<stop offset="100%" stopColor="rgba(139,92,246,0)" />
					</radialGradient>
				</defs>

				{/* Ambient glow */}
				<circle cx={center} cy={center} r={r + 30} fill="url(#cycle-glow)" />

				{/* Track ring — dashed */}
				<circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 4" />

				{/* Shimmer ring — animated gradient */}
				<circle cx={center} cy={center} r={r} fill="none" stroke="url(#cycle-shimmer)" strokeWidth="2.5" strokeLinecap="round" />

				{/* Stage nodes */}
				{positions.map((pos, i) => (
					<g key={i}>
						<circle cx={pos.x} cy={pos.y} r="16" fill="#0a0a14" stroke="rgba(139,92,246,0.4)" strokeWidth="1.5" />
						<text x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="rgba(196,181,253,0.9)" fontFamily="ui-sans-serif, system-ui">
							{pos.label}
						</text>
					</g>
				))}

				{/* Center infinity */}
				<text x={center} y={center + 4} textAnchor="middle" fontSize="22" fill="rgba(139,92,246,0.25)" fontFamily="ui-sans-serif">∞</text>
			</svg>
		</div>
	);
}

// ── Graphic 2: Silence — empty terminal with zero badges ──

function SilenceGraphic({ alerts }: { alerts: string[] }) {
	return (
		<div className="flex flex-col items-center gap-3 py-4">
			{/* Notification badges — all zero */}
			<div className="flex items-center gap-2">
				{alerts.map((label, i) => (
					<span key={i} className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
						{i === 0 && (
							<svg className="h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
							</svg>
						)}
						{i === 1 && (
							<svg className="h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
							</svg>
						)}
						{i === 2 && (
							<svg className="h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
							</svg>
						)}
						{label}
					</span>
				))}
			</div>

			{/* Empty terminal screen */}
			<div className="w-full max-w-[280px] overflow-hidden rounded-xl border border-zinc-700/50 bg-[#07070e] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]">
				{/* Title bar */}
				<div className="flex items-center gap-1.5 border-b border-zinc-800/50 px-3 py-2">
					<span className="h-2 w-2 rounded-full bg-zinc-700" />
					<span className="h-2 w-2 rounded-full bg-zinc-700" />
					<span className="h-2 w-2 rounded-full bg-zinc-700" />
					<span className="ml-2 text-[10px] font-medium text-zinc-600">analytics</span>
				</div>
				{/* Empty content with blinking cursor */}
				<div className="flex h-20 items-start p-4">
					<span className="inline-block h-4 w-[2px] animate-pulse bg-zinc-500" />
				</div>
			</div>

			{/* Muted bell */}
			<div className="flex items-center gap-2">
				<svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 005.714 0m-5.714 0a3 3 0 115.714 0M3.124 10.054A8.998 8.998 0 013 9.75V9a6 6 0 0112 0v.75c0 1.632-.217 3.213-.624 4.713M3.124 10.054A23.933 23.933 0 012 10.054" />
					<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" />
				</svg>
				<span className="text-[11px] font-medium text-zinc-600">Sem alertas</span>
			</div>
		</div>
	);
}

// ── Graphic 3: The Hole — coins draining through gap ──

function HoleGraphic({ topLabel, bottomLabel }: { topLabel: string; bottomLabel: string }) {
	const W = 200;
	const H = 320;

	return (
		<div className="flex items-center justify-center py-4">
			<svg width="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[180px] sm:max-w-[200px]">
				<defs>
					<linearGradient id="hole-fade-green" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
						<stop offset="100%" stopColor="rgba(16,185,129,0.05)" />
					</linearGradient>
					<linearGradient id="hole-fade-red" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="rgba(239,68,68,0.05)" />
						<stop offset="100%" stopColor="rgba(239,68,68,0.25)" />
					</linearGradient>
				</defs>

				{/* Top zone — healthy (emerald) */}
				<rect x="50" y="20" width="100" height="90" rx="12" fill="url(#hole-fade-green)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />

				{/* Coin stack at top */}
				{[0, 1, 2, 3, 4].map((i) => (
					<g key={`top-${i}`}>
						<ellipse cx={75 + i * 12} cy={55} rx="10" ry="6" fill="none" stroke="rgba(16,185,129,0.5)" strokeWidth="1.5" />
						<ellipse cx={75 + i * 12} cy={55} rx="6" ry="3" fill="rgba(16,185,129,0.15)" />
					</g>
				))}

				{/* Top label */}
				<text x={W / 2} y={95} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace" fill="rgba(16,185,129,0.8)">
					{topLabel}
				</text>

				{/* THE GAP — crack zone with pulsing glow */}
				<rect x="35" y="135" width="130" height="50" rx="4" fill="rgba(239,68,68,0.03)">
					<animate attributeName="opacity" values="0.5;1;0.5" dur="2.5s" repeatCount="indefinite" />
				</rect>
				<line x1="40" y1="140" x2="160" y2="140" stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="4 3" />
				<line x1="40" y1="180" x2="160" y2="180" stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="4 3" />

				{/* Falling coins — fall from top zone through gap into bottom zone */}
				{[0, 1, 2, 3, 4].map((i) => {
					const dur = 2.2 + i * 0.15;
					const delay = i * 0.5;
					const cx = 72 + i * 14;
					return (
						<g key={`fall-${i}`}>
							{/* Coin body */}
							<ellipse cx={cx} rx="8" ry="4.5" fill="rgba(16,185,129,0.5)" stroke="rgba(16,185,129,0.6)" strokeWidth="1">
								<animate attributeName="cy" values={`55;160;250`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" keySplines="0.4 0 1 1;0.4 0 1 1" calcMode="spline" />
								<animate attributeName="fill" values="rgba(16,185,129,0.5);rgba(239,68,68,0.5);rgba(239,68,68,0.15)" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
								<animate attributeName="stroke" values="rgba(16,185,129,0.6);rgba(239,68,68,0.5);rgba(239,68,68,0.1)" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
								<animate attributeName="opacity" values="0.9;0.7;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
							</ellipse>
							{/* Dollar sign on coin */}
							<text x={cx} textAnchor="middle" fontSize="5" fontWeight="bold" fill="rgba(255,255,255,0.6)" fontFamily="ui-monospace">
								$
								<animate attributeName="y" values={`57;162;252`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" keySplines="0.4 0 1 1;0.4 0 1 1" calcMode="spline" />
								<animate attributeName="opacity" values="0.7;0.4;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
							</text>
						</g>
					);
				})}

				{/* Question mark in the gap */}
				<text x={W / 2} y={167} textAnchor="middle" fontSize="28" fontWeight="bold" fill="rgba(255,255,255,0.06)" fontFamily="ui-sans-serif">?</text>

				{/* Bottom zone — depleted (red) */}
				<rect x="50" y="210" width="100" height="90" rx="12" fill="url(#hole-fade-red)" stroke="rgba(239,68,68,0.2)" strokeWidth="1" />

				{/* Depleted coins at bottom — fewer, smaller */}
				{[0, 1, 2].map((i) => (
					<g key={`bot-${i}`}>
						<ellipse cx={82 + i * 18} cy={250} rx="8" ry="4" fill="none" stroke="rgba(239,68,68,0.35)" strokeWidth="1" />
					</g>
				))}

				{/* Bottom label */}
				<text x={W / 2} y={285} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace" fill="rgba(239,68,68,0.7)">
					{bottomLabel}
				</text>
			</svg>
		</div>
	);
}

// ── BentoCard wrapper ──

function BentoCard({ accent, children, className = "" }: {
	accent: typeof ACCENTS[number];
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all duration-500 ease-out hover:-translate-y-1 hover:border-white/20 ${accent.hoverBorder} ${accent.hoverShadow} ${className}`}>
			{/* Top accent bar */}
			<div className={`pointer-events-none absolute left-0 right-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 ${accent.topAccent}`} />
			{/* Idle gradient */}
			<div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${accent.gradient} opacity-70 transition-opacity duration-500 group-hover:opacity-100`} />
			{/* Inner ring */}
			<div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all duration-500 group-hover:ring-white/[0.08]" />
			{/* Content */}
			<div className="relative flex flex-1 flex-col p-5 sm:p-6">
				{children}
			</div>
		</div>
	);
}

// ── Main ──

export default function SolutionLayers() {
	const t = useTranslations("homepage.solution_layers");
	const cards = t.raw("cards") as Array<{
		eyebrow: string;
		title: string;
		body: string;
		top_label?: string;
		bottom_label?: string;
		stages?: string[];
		alerts?: string[];
	}>;

	// Card order: [0] = O ciclo (top-left), [1] = O silêncio (bottom-left), [2] = O buraco (right tall)
	const cycle = cards[0];
	const silence = cards[2];
	const hole = cards[1]; // "O ciclo" is [0], swap [1] and [2] for layout

	return (
		<section className="relative bg-[#090911] py-8 sm:py-10 lg:py-14">
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[30%] h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-red-900/[0.06] blur-[80px] sm:h-[500px] sm:w-[600px] sm:blur-[100px]" />
			</div>

			<div className="mx-auto mb-8 max-w-[700px] px-4 text-center sm:mb-10 sm:px-8">
				<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
					<span className="h-1.5 w-1.5 rounded-full bg-red-400" />
					<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300/90">{t("section_label")}</span>
				</div>
				<h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-[2.25rem]">{t("title")}</h2>
			</div>

			{/* Bento grid: =| layout */}
			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				<div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1fr_1fr_1fr] lg:grid-rows-[1fr_1fr]">

					{/* Card 1: O ciclo — top-left */}
					<BentoCard accent={ACCENTS[0]} className="lg:col-start-1 lg:row-start-1">
						<CycleGraphic stages={cycle?.stages || []} />
						<div className="mt-auto">
							<span className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${ACCENTS[0].pill}`}>
								{cycle?.eyebrow}
							</span>
							<h3 className="mb-2 text-base font-bold tracking-tight text-white sm:text-lg">{cycle?.title}</h3>
							<p className="text-[13px] leading-relaxed text-zinc-400">{cycle?.body}</p>
						</div>
					</BentoCard>

					{/* Card 2: O silêncio — bottom-left */}
					<BentoCard accent={ACCENTS[1]} className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
						<SilenceGraphic alerts={silence?.alerts || []} />
						<div className="mt-auto">
							<span className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${ACCENTS[1].pill}`}>
								{silence?.eyebrow}
							</span>
							<h3 className="mb-2 text-base font-bold tracking-tight text-white sm:text-lg">{silence?.title}</h3>
							<p className="text-[13px] leading-relaxed text-zinc-400">{silence?.body}</p>
						</div>
					</BentoCard>

					{/* Card 3: O buraco — right, spans 2 rows (tall) */}
					<BentoCard accent={ACCENTS[2]} className="lg:col-start-3 lg:row-span-2">
						<HoleGraphic topLabel={hole?.top_label || ""} bottomLabel={hole?.bottom_label || ""} />
						<div className="mt-auto">
							<span className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${ACCENTS[2].pill}`}>
								{hole?.eyebrow}
							</span>
							<h3 className="mb-2 text-base font-bold tracking-tight text-white sm:text-lg">{hole?.title}</h3>
							<p className="text-[13px] leading-relaxed text-zinc-400">{hole?.body}</p>
						</div>
					</BentoCard>

					{/* Card 1 bottom — O ciclo occupies only top-left, this fills bottom-left */}
					{/* We need a 4th element or restructure. Let's use closing text as bottom-left card */}
					<div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.01] p-6 lg:col-start-1 lg:row-start-2">
						<p className="text-center text-base font-medium leading-relaxed text-zinc-300 sm:text-lg">
							{t("closing")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
