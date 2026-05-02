"use client";

import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// "O problema" — bento grid with visceral graphics
//
// Card 1: "O buraco" — coins falling through a gap
// Card 2: "O ciclo" — dot looping through stages forever
// Card 3: "O silêncio" — empty terminal, cursor blinking alone
// ──────────────────────────────────────────────

// ── Graphic 1: Coins falling through a gap ──

function CoinsGraphic({ topLabel, bottomLabel }: { topLabel: string; bottomLabel: string }) {
	return (
		<div className="relative flex h-[180px] w-full flex-col items-center justify-between sm:h-[200px]">
			{/* Top — ad spend */}
			<div className="flex items-center gap-2">
				<div className="flex -space-x-1">
					{[0, 1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="h-5 w-5 rounded-full border border-amber-400/40 bg-amber-500/20 sm:h-6 sm:w-6"
							style={{ animationDelay: `${i * 120}ms` }}
						/>
					))}
				</div>
				<span className="font-mono text-[11px] font-semibold tabular-nums text-amber-300">{topLabel}</span>
			</div>

			{/* Middle — the gap / hole */}
			<div className="relative flex w-full items-center justify-center">
				{/* Crack lines */}
				<div className="absolute h-px w-[40%] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
				{/* Falling coins */}
				<div className="relative h-16 w-20 overflow-hidden">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-red-400/50 bg-red-500/30"
							style={{
								animation: `coin-fall 2s ease-in infinite`,
								animationDelay: `${i * 600}ms`,
								left: `${40 + i * 10}%`,
							}}
						/>
					))}
				</div>
				{/* Question mark */}
				<span className="absolute font-serif text-4xl font-bold text-zinc-800 sm:text-5xl">?</span>
			</div>

			{/* Bottom — revenue */}
			<div className="flex items-center gap-2">
				<div className="flex -space-x-1">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="h-4 w-4 rounded-full border border-red-400/30 bg-red-500/15 sm:h-5 sm:w-5"
						/>
					))}
				</div>
				<span className="font-mono text-[11px] font-semibold tabular-nums text-red-400">{bottomLabel}</span>
			</div>

			<style>{`
				@keyframes coin-fall {
					0% { transform: translateX(-50%) translateY(-20px); opacity: 0; }
					20% { opacity: 1; }
					80% { opacity: 0.6; }
					100% { transform: translateX(-50%) translateY(60px); opacity: 0; }
				}
			`}</style>
		</div>
	);
}

// ── Graphic 2: Dot looping through stages ──

function CycleGraphic({ stages }: { stages: string[] }) {
	return (
		<div className="relative flex h-[180px] w-full items-center justify-center sm:h-[200px]">
			{/* Circular path */}
			<svg className="absolute h-[140px] w-[140px] sm:h-[160px] sm:w-[160px]" viewBox="0 0 160 160" fill="none">
				{/* Track ring */}
				<circle cx="80" cy="80" r="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeDasharray="4 3" />
				{/* Animated dot */}
				<circle r="5" fill="#f87171" className="drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]">
					<animateMotion dur="3s" repeatCount="indefinite" path="M80,20 A60,60 0 0,1 140,80 A60,60 0 0,1 80,140 A60,60 0 0,1 20,80 A60,60 0 0,1 80,20" />
				</circle>
				{/* Stage markers */}
				{[
					{ x: 80, y: 20 },   // top
					{ x: 140, y: 80 },   // right
					{ x: 20, y: 80 },    // left
				].map((pos, i) => (
					<circle key={i} cx={pos.x} cy={pos.y} r="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
				))}
			</svg>

			{/* Stage labels */}
			<span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-medium text-zinc-500 sm:top-1">{stages[0]}</span>
			<span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-500 sm:right-4">{stages[2]}</span>
			<span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-500 sm:left-4">{stages[1]}</span>

			{/* Center — "infinite" symbol */}
			<span className="text-2xl text-zinc-700">∞</span>
		</div>
	);
}

// ── Graphic 3: Empty terminal with cursor ──

function SilenceGraphic({ alerts }: { alerts: string[] }) {
	return (
		<div className="flex h-[180px] w-full flex-col items-center justify-center gap-4 sm:h-[200px]">
			{/* Notification badges — all zero */}
			<div className="flex items-center gap-2">
				{alerts.map((label, i) => (
					<span key={i} className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-[10px] text-zinc-600">
						{i === 0 && (
							<svg className="h-3 w-3 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
							</svg>
						)}
						{i === 1 && (
							<svg className="h-3 w-3 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
							</svg>
						)}
						{i === 2 && (
							<svg className="h-3 w-3 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
							</svg>
						)}
						{label}
					</span>
				))}
			</div>

			{/* Empty terminal screen */}
			<div className="w-full max-w-[220px] overflow-hidden rounded-lg border border-zinc-800 bg-[#07070e] sm:max-w-[260px]">
				{/* Title bar */}
				<div className="flex items-center gap-1.5 border-b border-zinc-800/60 px-3 py-1.5">
					<span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
					<span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
					<span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
					<span className="ml-2 text-[8px] text-zinc-700">analytics</span>
				</div>
				{/* Empty content with blinking cursor */}
				<div className="flex h-16 items-start p-3 sm:h-20">
					<span className="inline-block h-3.5 w-[2px] animate-pulse bg-zinc-600" />
				</div>
			</div>

			{/* Muted bell */}
			<div className="flex items-center gap-1.5">
				<svg className="h-3.5 w-3.5 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 005.714 0m-5.714 0a3 3 0 115.714 0M3.124 10.054A8.998 8.998 0 013 9.75V9a6 6 0 0112 0v.75c0 1.632-.217 3.213-.624 4.713M3.124 10.054A23.933 23.933 0 012 10.054" />
					<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
				</svg>
				<span className="text-[10px] text-zinc-700">Sem alertas</span>
			</div>
		</div>
	);
}

// ── Bento Card wrapper ──

const CARD_ACCENTS = [
	{ border: "border-red-500/20", glow: "hover:shadow-[0_8px_40px_-12px_rgba(239,68,68,0.2)]", pill: "bg-red-500/10 text-red-400", gradient: "from-red-500/[0.05]" },
	{ border: "border-violet-500/20", glow: "hover:shadow-[0_8px_40px_-12px_rgba(139,92,246,0.2)]", pill: "bg-violet-500/10 text-violet-400", gradient: "from-violet-500/[0.05]" },
	{ border: "border-amber-500/20", glow: "hover:shadow-[0_8px_40px_-12px_rgba(245,158,11,0.2)]", pill: "bg-amber-500/10 text-amber-400", gradient: "from-amber-500/[0.05]" },
] as const;

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

			{/* Bento grid — 3 cards, 1 spanning 2 cols on desktop */}
			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{cards.map((card, i) => {
						const accent = CARD_ACCENTS[i];
						return (
							<div
								key={i}
								className={`group relative overflow-hidden rounded-2xl border ${accent.border} bg-[#0c0c14] transition-all duration-500 ${accent.glow}`}
							>
								{/* Hover gradient */}
								<div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.gradient} via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

								{/* Top accent bar */}
								<div className={`h-px w-full bg-gradient-to-r from-transparent ${i === 0 ? "via-red-500/30" : i === 1 ? "via-violet-500/30" : "via-amber-500/30"} to-transparent`} />

								<div className="relative flex flex-col p-5 sm:p-6">
									{/* Graphic */}
									<div className="mb-4">
										{i === 0 && <CoinsGraphic topLabel={card.top_label || ""} bottomLabel={card.bottom_label || ""} />}
										{i === 1 && <CycleGraphic stages={card.stages || []} />}
										{i === 2 && <SilenceGraphic alerts={card.alerts || []} />}
									</div>

									{/* Eyebrow */}
									<span className={`mb-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${accent.pill}`}>
										{card.eyebrow}
									</span>

									{/* Title */}
									<h3 className="mb-2 text-base font-bold tracking-tight text-white sm:text-lg">
										{card.title}
									</h3>

									{/* Body */}
									<p className="text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
										{card.body}
									</p>
								</div>
							</div>
						);
					})}
				</div>

				{/* Closing line */}
				<div className="mt-8 text-center sm:mt-10">
					<p className="text-base font-medium leading-relaxed text-zinc-300 sm:text-lg">
						{t("closing")}
					</p>
				</div>
			</div>
		</section>
	);
}
