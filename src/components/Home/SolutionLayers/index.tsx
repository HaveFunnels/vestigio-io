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
	const SIZE = 240;
	const center = SIZE / 2;
	const r = 80;

	const positions = [
		{ x: center, y: center - r, label: stages[0] || "" },
		{ x: center + r * 0.87, y: center + r * 0.5, label: stages[2] || "" },
		{ x: center - r * 0.87, y: center + r * 0.5, label: stages[1] || "" },
	];

	const circumference = 2 * Math.PI * r;

	return (
		<div className="flex items-center justify-center py-4">
			<style>{`
				@keyframes sl-cycle-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
			`}</style>
			<svg width="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-[220px] sm:max-w-[240px]">
				<defs>
					<radialGradient id="cycle-glow" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
						<stop offset="100%" stopColor="rgba(255,255,255,0)" />
					</radialGradient>
				</defs>

				{/* Ambient glow */}
				<circle cx={center} cy={center} r={r + 30} fill="url(#cycle-glow)" />

				{/* Track ring — dashed */}
				<circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 4" />

				{/* Shimmer dash — CSS animated */}
				<circle
					cx={center} cy={center} r={r}
					fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"
					strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
					style={{ transformOrigin: `${center}px ${center}px`, animation: "sl-cycle-spin 4s linear infinite" }}
				/>

				{/* Stage nodes */}
				{positions.map((pos, i) => (
					<g key={i}>
						<circle cx={pos.x} cy={pos.y} r="26" fill="#0a0a14" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
						<text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.85)" fontFamily="ui-sans-serif, system-ui">
							{pos.label}
						</text>
					</g>
				))}

				{/* Center infinity */}
				<text x={center} y={center + 4} textAnchor="middle" fontSize="24" fill="rgba(255,255,255,0.1)" fontFamily="ui-sans-serif">∞</text>
			</svg>
		</div>
	);
}

// ── Graphic 2: Silence — empty terminal with zero badges ──

function SilenceGraphic({ alerts, terminalTitle, noAlerts }: { alerts: string[]; terminalTitle: string; noAlerts: string }) {
	return (
		<div className="flex flex-col items-center gap-3 py-4">
			<style>{`
				@keyframes sl-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
			`}</style>
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
					<span className="ml-2 text-[10px] font-medium text-zinc-600">{terminalTitle}</span>
				</div>
				{/* Empty content with blinking cursor */}
				<div className="flex h-20 items-start p-4">
					<span className="inline-block h-4 w-[2px] bg-zinc-500" style={{ animation: "sl-blink 1s step-end infinite" }} />
				</div>
			</div>

			{/* Muted bell */}
			<div className="flex items-center gap-2">
				<svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 005.714 0m-5.714 0a3 3 0 115.714 0M3.124 10.054A8.998 8.998 0 013 9.75V9a6 6 0 0112 0v.75c0 1.632-.217 3.213-.624 4.713M3.124 10.054A23.933 23.933 0 012 10.054" />
					<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" />
				</svg>
				<span className="text-[11px] font-medium text-zinc-600">{noAlerts}</span>
			</div>
		</div>
	);
}

// ── Graphic 3: The Hole — coins sucked into a drain ──

function HoleGraphic({ topLabel, bottomLabel }: { topLabel: string; bottomLabel: string }) {
	const SIZE = 220;
	const cx = SIZE / 2;
	const cy = SIZE / 2 + 5;

	// Coins: offset from center (where they START), animate TO center (0,0)
	const COINS = [
		{ ox: -72, oy: -75, dur: 2.6, delay: 0   },
		{ ox:  48, oy: -63, dur: 2.3, delay: 0.6 },
		{ ox: -84, oy:  -7, dur: 2.8, delay: 1.2 },
		{ ox:  60, oy: -15, dur: 2.1, delay: 0.3 },
		{ ox: -10, oy: -87, dur: 2.5, delay: 0.9 },
		{ ox: -50, oy:  55, dur: 2.4, delay: 1.6 },
		{ ox:  38, oy:  50, dur: 2.7, delay: 0.5 },
	];

	const SLOT_COUNT = 8;
	const drainR = 28;
	const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
		const angle = (i * Math.PI * 2) / SLOT_COUNT;
		const innerR = 8;
		return {
			x1: cx + Math.cos(angle) * innerR,
			y1: cy + Math.sin(angle) * innerR,
			x2: cx + Math.cos(angle) * drainR,
			y2: cy + Math.sin(angle) * drainR,
		};
	});

	return (
		<div className="flex items-center justify-center py-4">
			<style>{`
				@keyframes sl-drain-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
				@keyframes sl-drain-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
				${COINS.map((c, i) => `
				@keyframes sl-drain-c${i} {
					0%   { transform: translate(${c.ox}px, ${c.oy}px); opacity: 0.9; }
					80%  { transform: translate(${c.ox * 0.1}px, ${c.oy * 0.1}px); opacity: 0.5; }
					100% { transform: translate(0, 0); opacity: 0; }
				}
				.sl-dc${i} { animation: sl-drain-c${i} ${c.dur}s ease-in ${c.delay}s infinite; }
				`).join("")}
			`}</style>
			<svg width="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-[200px] sm:max-w-[220px]">
				<defs>
					<radialGradient id="drain-glow" cx="50%" cy="52%" r="45%">
						<stop offset="0%" stopColor="rgba(239,68,68,0.2)" />
						<stop offset="60%" stopColor="rgba(239,68,68,0.05)" />
						<stop offset="100%" stopColor="rgba(239,68,68,0)" />
					</radialGradient>
					<radialGradient id="drain-hole" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor="rgba(0,0,0,0.9)" />
						<stop offset="100%" stopColor="rgba(239,68,68,0.1)" />
					</radialGradient>
				</defs>

				{/* Ambient red glow behind drain */}
				<circle cx={cx} cy={cy} r="80" fill="url(#drain-glow)" style={{ animation: "sl-drain-pulse 3s ease-in-out infinite" }} />

				{/* Drain outer ring */}
				<circle cx={cx} cy={cy} r={drainR} fill="none" stroke="rgba(239,68,68,0.35)" strokeWidth="2" />
				{/* Drain middle ring */}
				<circle cx={cx} cy={cy} r={drainR * 0.6} fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="1" />
				{/* Drain inner dark hole */}
				<circle cx={cx} cy={cy} r="8" fill="url(#drain-hole)" />

				{/* Drain grate slots — radial lines, slowly spinning */}
				<g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "sl-drain-spin 12s linear infinite" }}>
					{slots.map((s, i) => (
						<line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="rgba(239,68,68,0.25)" strokeWidth="1.5" strokeLinecap="round" />
					))}
				</g>

				{/* Coins — all placed at center, CSS offsets them out then animates back to center */}
				{COINS.map((c, i) => (
					<g key={i} className={`sl-dc${i}`}>
						<circle cx={cx} cy={cy} r="11" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.5)" strokeWidth="1.5" />
						<text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(16,185,129,0.7)" fontFamily="ui-monospace, monospace">$</text>
					</g>
				))}

				{/* Top label */}
				<text x={cx} y={22} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace" fill="rgba(16,185,129,0.7)">
					{topLabel}
				</text>

				{/* Bottom label */}
				<text x={cx} y={SIZE - 8} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace" fill="rgba(239,68,68,0.65)">
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
		terminal_title?: string;
		no_alerts?: string;
	}>;

	// Dictionary order: [0] = O buraco, [1] = O ciclo, [2] = O silêncio
	const hole = cards[0];
	const cycle = cards[1];
	const silence = cards[2];

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
						<SilenceGraphic alerts={silence?.alerts || []} terminalTitle={silence?.terminal_title || "analytics"} noAlerts={silence?.no_alerts || "No alerts"} />
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
