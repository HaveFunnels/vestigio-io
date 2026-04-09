/**
 * Home > Hero — the front door of vestigio.io.
 *
 * Layout (top → bottom):
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │  Announcement banner — thin pill above the headline   │
 *   ├───────────────────────────────────────────────────────┤
 *   │  Headline (two-line, dynamic gradient on the lead)    │
 *   │  Subtitle                                             │
 *   │  5 horizontal "pill" cards with checkboxes + icons    │
 *   │  Two CTAs (primary + secondary)                       │
 *   │  Microcopy line                                       │
 *   ├───────────────────────────────────────────────────────┤
 *   │  Giant browser-shell card                             │
 *   │  ├─ chrome bar with traffic-light dots + URL          │
 *   │  └─ vertical gradient + horizontal stripe layers      │
 *   │     ├─ Vestigio AI panel  (left float)                │
 *   │     ├─ Action Queue panel (center)                    │
 *   │     └─ Recovery callout   (right float)               │
 *   └───────────────────────────────────────────────────────┘
 *
 * Background: full-bleed vertical gradient (vestigio palette: emerald
 * → indigo dusk → near-black) with subtle horizontal stripe layers,
 * plus animated "vestigio trails" — vertical traces descending the
 * canvas as a quiet psychological cue to scroll. Trails are CSS-only
 * keyframes prefixed with `vhero-` to avoid global collisions.
 *
 * The component is a server component (`async`) using `getTranslations`
 * so it stays out of the client bundle. CTA hrefs/labels are still
 * overridable via props for the /lp variant.
 *
 * All copy lives under `homepage.hero_v2.*` in the dictionaries.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface HeroProps {
	// Optional CTA destination override. Default = signup flow.
	// /lp variant passes "/lp/audit" so the primary CTA jumps directly
	// into the anonymous lead funnel instead of asking for signup.
	primaryCtaHref?: string;
	primaryCtaLabel?: string;
}

interface ActionRow {
	priority: string;
	title: string;
	impact: string;
	severity: "critical" | "high" | "medium" | "low";
}

const SEVERITY_STYLES: Record<ActionRow["severity"], string> = {
	critical: "border-red-500/30 bg-red-500/10 text-red-300",
	high: "border-orange-500/30 bg-orange-500/10 text-orange-300",
	medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	low: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

const SEVERITY_DOT: Record<ActionRow["severity"], string> = {
	critical: "bg-red-400",
	high: "bg-orange-400",
	medium: "bg-amber-400",
	low: "bg-sky-400",
};

/* ──────────────────────────────────────────────────────────────────
 * Pill icons — one per promise. Stroke-only outline icons so they
 * read as a uniform set. 18px so the row stays tight.
 * ──────────────────────────────────────────────────────────────── */

// Pill icons stored as render functions so the elements are
// constructed at use-site (each call gets a fresh element). This
// avoids the `react/jsx-key` lint warning that fires when JSX
// elements are stored directly in an array literal — even when the
// elements are read by index, eslint still requires keys.
const PILL_ICONS: Array<() => JSX.Element> = [
	// 1. Find revenue leaks — a droplet (leaks = water dropping)
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M10 2.5c-2.5 3-5 5.8-5 9a5 5 0 0010 0c0-3.2-2.5-6-5-9z' />
		</svg>
	),
	// 2. Prioritize fixes — three stacked bars (priority queue)
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M3 5h14M3 10h10M3 15h6' />
		</svg>
	),
	// 3. Verify with evidence — checkmark inside shield
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M10 2.5l6 2v5c0 4-3 7-6 8-3-1-6-4-6-8v-5l6-2z' />
			<path d='M7.5 10l2 2 3.5-4' />
		</svg>
	),
	// 4. Catch regressions — clock with arrow ring
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<circle cx='10' cy='10' r='6.5' />
			<path d='M10 6.5V10l2.2 2' />
		</svg>
	),
	// 5. Decide with confidence — diamond / decision node
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M10 2.5L17.5 10 10 17.5 2.5 10 10 2.5z' />
			<circle cx='10' cy='10' r='1.6' fill='currentColor' />
		</svg>
	),
];

/* ──────────────────────────────────────────────────────────────────
 * Animated Vestigio trails — descending dot traces as a subtle
 * psychological scroll cue. Each trail is a fixed-width column with
 * a 2x24px dot animating top→bottom, staggered via inline delays so
 * they never all run in lockstep. CSS-keyframes only — no JS.
 * ──────────────────────────────────────────────────────────────── */

const TRAIL_LANES: Array<{ leftPct: number; delay: number; duration: number }> =
	[
		{ leftPct: 6, delay: 0, duration: 14 },
		{ leftPct: 14, delay: 4.5, duration: 11 },
		{ leftPct: 22, delay: 1.7, duration: 16 },
		{ leftPct: 31, delay: 7, duration: 13 },
		{ leftPct: 42, delay: 3, duration: 18 },
		{ leftPct: 51, delay: 6.2, duration: 12 },
		{ leftPct: 60, delay: 1, duration: 15 },
		{ leftPct: 69, delay: 8, duration: 17 },
		{ leftPct: 78, delay: 2.3, duration: 13 },
		{ leftPct: 86, delay: 5.5, duration: 14 },
		{ leftPct: 94, delay: 0.8, duration: 11 },
	];

const TrailLayer = () => (
	<div
		className='pointer-events-none absolute inset-0 -z-1 overflow-hidden'
		aria-hidden
	>
		{TRAIL_LANES.map((lane, i) => (
			<div
				key={i}
				className='absolute top-0 h-full w-px'
				style={{ left: `${lane.leftPct}%` }}
			>
				{/* faint vertical guide line so the trace looks like it
				    follows a path; barely visible at idle */}
				<div className='absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent' />
				{/* the moving trace itself — a small bright vertical
				    segment with an emerald glow */}
				<div
					className='vhero-trail absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-emerald-300/70 to-transparent shadow-[0_0_8px_rgba(110,231,183,0.45)]'
					style={{
						animationDelay: `-${lane.delay}s`,
						animationDuration: `${lane.duration}s`,
					}}
				/>
			</div>
		))}
	</div>
);

/* ──────────────────────────────────────────────────────────────────
 * Browser shell — the "product proof" surface. A chrome bar plus an
 * inner canvas with stripe layers and three floating UI panels.
 * ──────────────────────────────────────────────────────────────── */

interface ShellProps {
	url: string;
	tabActive: string;
	tabFindings: string;
	tabSurfaces: string;
	queueEyebrow: string;
	queueCount: string;
	actions: ActionRow[];
	assistantEyebrow: string;
	assistantMessage: string;
	assistantChipEvidence: string;
	assistantChipAction: string;
	calloutEyebrow: string;
	calloutValue: string;
	calloutUnit: string;
	calloutSub: string;
}

const BrowserShell = (p: ShellProps) => (
	<div className='relative mx-auto w-full max-w-[1240px]'>
		{/* Outer glow halo behind the shell — emerald + indigo bloom that
		    sells the "important surface" feeling */}
		<div
			className='pointer-events-none absolute -inset-x-6 -inset-y-12 -z-1 opacity-90 blur-3xl'
			aria-hidden
		>
			<div className='absolute left-1/4 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-emerald-500/15' />
			<div className='absolute right-1/4 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-indigo-500/15' />
		</div>

		<div className='vhero-shell relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#080812] shadow-[0_40px_120px_-30px_rgba(16,185,129,0.28),0_30px_80px_-40px_rgba(99,102,241,0.32),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-[1.5rem]'>
			{/* Chrome bar */}
			<div className='flex items-center gap-3 border-b border-white/[0.06] bg-[#0a0a14] px-3 py-2.5 sm:px-5 sm:py-3'>
				<div className='flex gap-1.5'>
					<span className='h-2.5 w-2.5 rounded-full bg-zinc-700' />
					<span className='h-2.5 w-2.5 rounded-full bg-zinc-700' />
					<span className='h-2.5 w-2.5 rounded-full bg-zinc-700' />
				</div>
				<div className='ml-1 flex min-w-0 flex-1 items-center justify-center sm:ml-3'>
					<div className='inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-white/5 bg-white/[0.03] px-3 py-1 font-mono text-[10px] text-zinc-500 sm:text-[11px]'>
						<svg
							viewBox='0 0 12 12'
							fill='none'
							stroke='currentColor'
							strokeWidth='1.4'
							className='h-3 w-3 shrink-0 text-emerald-400/80'
						>
							<path
								d='M4 6l1.5 1.5L8 4.5'
								strokeLinecap='round'
								strokeLinejoin='round'
							/>
							<circle cx='6' cy='6' r='4.5' />
						</svg>
						<span className='truncate'>{p.url}</span>
					</div>
				</div>
				<div className='hidden w-[52px] sm:block' />
			</div>

			{/* Inner canvas — vertical gradient + horizontal stripe layers
			    in vestigio palette. The stripes give the surface a "real
			    product" feeling rather than a flat backdrop. */}
			<div className='relative isolate min-h-[480px] overflow-hidden bg-gradient-to-b from-[#0d1d18] via-[#0b0f1c] to-[#080812] px-4 py-8 sm:min-h-[560px] sm:px-8 sm:py-10 md:min-h-[600px] md:px-10 md:py-12 lg:min-h-[640px]'>
				{/* Stripe layers — soft horizontal bands fading top→bottom */}
				<div className='pointer-events-none absolute inset-0 -z-10' aria-hidden>
					<div className='absolute inset-x-0 top-0 h-px bg-emerald-400/20' />
					<div className='bg-emerald-400/12 absolute inset-x-0 top-[18%] h-px' />
					<div className='absolute inset-x-0 top-[34%] h-px bg-white/[0.04]' />
					<div className='absolute inset-x-0 top-[50%] h-px bg-indigo-400/10' />
					<div className='absolute inset-x-0 top-[66%] h-px bg-white/[0.03]' />
					<div className='absolute inset-x-0 top-[82%] h-px bg-indigo-400/[0.06]' />
				</div>

				{/* Soft radial spotlights to add depth */}
				<div
					className='pointer-events-none absolute -left-20 top-1/3 h-[320px] w-[320px] rounded-full bg-emerald-500/[0.08] blur-3xl'
					aria-hidden
				/>
				<div
					className='pointer-events-none absolute -right-16 top-2/3 h-[280px] w-[280px] rounded-full bg-indigo-500/[0.10] blur-3xl'
					aria-hidden
				/>

				{/* Floating Vestigio AI panel — left side, slightly tilted */}
				<div className='vhero-float-left relative z-20 mx-auto mb-6 max-w-[280px] rounded-2xl border border-violet-500/25 bg-[#0c0d1c]/95 p-3.5 shadow-[0_24px_60px_-24px_rgba(139,92,246,0.6)] backdrop-blur sm:mb-0 sm:max-w-[300px] md:absolute md:left-4 md:top-10 md:rotate-[-1.5deg] lg:left-8 lg:top-12'>
					<div className='mb-2 flex items-center gap-2'>
						<div className='relative flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/20'>
							<div className='absolute inset-0 animate-[vhero-pulse_2.6s_ease-in-out_infinite] rounded-md bg-violet-400/30' />
							<svg
								viewBox='0 0 12 12'
								fill='none'
								className='relative h-3 w-3 text-violet-300'
							>
								<path
									d='M6 1l1.4 3.2L10.5 6 7.4 7.4 6 11l-1.4-3.6L1.5 6l3.1-1.8L6 1z'
									fill='currentColor'
								/>
							</svg>
						</div>
						<span className='text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300'>
							{p.assistantEyebrow}
						</span>
						<span className='ml-auto h-1.5 w-1.5 animate-[vhero-pulse_1.6s_ease-in-out_infinite] rounded-full bg-emerald-400' />
					</div>
					<p className='mb-3 text-[11px] leading-relaxed text-zinc-200 sm:text-xs'>
						{p.assistantMessage}
					</p>
					<div className='flex flex-wrap gap-1.5'>
						<span className='inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300'>
							<span className='h-1 w-1 rounded-full bg-emerald-400' />
							{p.assistantChipEvidence}
						</span>
						<span className='inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-300'>
							<span className='h-1 w-1 rounded-full bg-violet-400' />
							{p.assistantChipAction}
						</span>
					</div>
				</div>

				{/* Center: Action Queue panel */}
				<div className='vhero-float-up relative z-10 mx-auto max-w-[640px] rounded-2xl border border-white/10 bg-[#0a0b14]/95 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur sm:p-5 md:max-w-[560px] lg:max-w-[640px]'>
					{/* Header row */}
					<div className='mb-4 flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<span className='inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300'>
								<span className='h-1 w-1 rounded-full bg-emerald-400' />
								{p.queueEyebrow}
							</span>
						</div>
						<span className='font-mono text-[10px] tabular-nums text-zinc-500'>
							{p.queueCount}
						</span>
					</div>

					{/* Action rows */}
					<div className='space-y-1.5'>
						{p.actions.map((a) => (
							<div
								key={a.priority}
								className='group/row flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03]'
							>
								<span className='inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] font-mono text-[10px] font-bold text-zinc-400'>
									{a.priority}
								</span>
								<span
									className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`}
								/>
								<span className='min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-200 sm:text-xs'>
									{a.title}
								</span>
								<span className='hidden font-mono text-[10px] tabular-nums text-red-400 sm:inline sm:text-[11px]'>
									{a.impact}
								</span>
								<span
									className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] md:inline-block ${SEVERITY_STYLES[a.severity]}`}
								>
									{a.severity}
								</span>
							</div>
						))}
					</div>

					{/* Tab strip at the bottom */}
					<div className='mt-4 flex items-center gap-1 border-t border-white/[0.06] pt-3'>
						{[p.tabActive, p.tabFindings, p.tabSurfaces].map((tab, i) => (
							<span
								key={tab}
								className={`rounded-md px-2 py-1 text-[10px] font-medium ${
									i === 0 ? "bg-white/[0.06] text-white" : "text-zinc-500"
								}`}
							>
								{tab}
							</span>
						))}
					</div>
				</div>

				{/* Floating Recovered callout — right side, slightly tilted */}
				<div className='vhero-float-right relative z-20 mx-auto mt-6 max-w-[260px] rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.04] p-4 shadow-[0_24px_60px_-24px_rgba(16,185,129,0.6)] backdrop-blur sm:mt-0 md:absolute md:bottom-12 md:right-4 md:rotate-[1.5deg] lg:bottom-16 lg:right-8'>
					<div className='mb-1 flex items-center gap-2'>
						<svg
							viewBox='0 0 16 16'
							fill='none'
							stroke='currentColor'
							strokeWidth='1.6'
							className='h-3.5 w-3.5 text-emerald-300'
						>
							<path
								d='M3 12l3-5 3 3 4-7'
								strokeLinecap='round'
								strokeLinejoin='round'
							/>
							<path d='M9 3h4v4' strokeLinecap='round' strokeLinejoin='round' />
						</svg>
						<span className='text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300'>
							{p.calloutEyebrow}
						</span>
					</div>
					<div className='font-mono text-2xl font-semibold tabular-nums leading-none text-emerald-200 sm:text-3xl'>
						{p.calloutValue}
						<span className='ml-1 text-xs font-normal text-emerald-400/70 sm:text-sm'>
							{p.calloutUnit}
						</span>
					</div>
					<div className='mt-1 text-[10px] text-emerald-400/60'>
						{p.calloutSub}
					</div>
				</div>
			</div>
		</div>
	</div>
);

/* ──────────────────────────────────────────────────────────────────
 * Section
 * ──────────────────────────────────────────────────────────────── */

const Hero = async ({
	primaryCtaHref = "/auth/signup",
	primaryCtaLabel,
}: HeroProps = {}) => {
	const t = await getTranslations("homepage.hero_v2");
	const pills = t.raw("pills") as string[];
	const actions = t.raw("shell.actions") as ActionRow[];

	return (
		<section className='relative z-1 overflow-hidden pb-20 pt-10 sm:pb-24 sm:pt-14 lg:pb-32 lg:pt-20'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				@keyframes vhero-trail {
					0%   { transform: translateY(-80px); opacity: 0; }
					12%  { opacity: 0.85; }
					88%  { opacity: 0.85; }
					100% { transform: translateY(800px); opacity: 0; }
				}
				.vhero-trail {
					animation-name: vhero-trail;
					animation-iteration-count: infinite;
					animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1);
				}
				@keyframes vhero-pulse {
					0%, 100% { transform: scale(1); opacity: 0.9; }
					50%      { transform: scale(1.18); opacity: 0.55; }
				}
				@keyframes vhero-float-up {
					0%   { opacity: 0; transform: translateY(20px); }
					100% { opacity: 1; transform: translateY(0); }
				}
				@keyframes vhero-float-left {
					0%   { opacity: 0; transform: translateX(-12px) rotate(-1.5deg); }
					100% { opacity: 1; transform: translateX(0) rotate(-1.5deg); }
				}
				@keyframes vhero-float-right {
					0%   { opacity: 0; transform: translateX(12px) rotate(1.5deg); }
					100% { opacity: 1; transform: translateX(0) rotate(1.5deg); }
				}
				.vhero-shell {
					animation: vhero-float-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
				}
				@media (min-width: 768px) {
					.vhero-float-left  { animation: vhero-float-left  1.1s cubic-bezier(0.16,1,0.3,1) 0.55s both; }
					.vhero-float-right { animation: vhero-float-right 1.1s cubic-bezier(0.16,1,0.3,1) 0.7s both; }
				}
				.vhero-float-up {
					animation: vhero-float-up 1s cubic-bezier(0.16,1,0.3,1) 0.4s both;
				}
				@media (prefers-reduced-motion: reduce) {
					.vhero-trail,
					.vhero-shell,
					.vhero-float-left,
					.vhero-float-right,
					.vhero-float-up {
						animation: none !important;
					}
				}
			`}</style>

			{/* Background — full-bleed vertical gradient in vestigio palette */}
			<div className='-z-2 absolute inset-0' aria-hidden>
				<div className='absolute inset-0 bg-gradient-to-b from-[#0a1a14] via-[#080912] to-[#080812]' />
				{/* central blooming halo */}
				<div className='absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[140px]' />
				<div className='absolute left-1/2 top-[200px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[160px]' />
			</div>

			{/* Animated descending vestigio trails */}
			<TrailLayer />

			{/* Announcement banner lives in the site layout now
			    (src/components/AnnouncementBanner) so it sits above the
			    header on the very first paint and auto-hides on scroll. */}

			{/* ─────────── Headline + subtitle + pills + CTAs ─────────── */}
			<div className='relative mx-auto w-full max-w-[1000px] px-4 text-center sm:px-8 xl:px-0'>
				<h1 className='mb-5 text-[2.1rem] font-bold leading-[1.05] tracking-tight text-white sm:mb-6 sm:text-[3.25rem] lg:text-[4rem] xl:text-[4.5rem]'>
					<span className='block'>{t("headline_part1")}</span>
					<span className='block bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-300 bg-clip-text pb-1 text-transparent'>
						{t("headline_part2")}
					</span>
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[680px] text-base leading-relaxed text-zinc-400 sm:mb-10 sm:text-lg'>
					{t("subtitle")}
				</p>

				{/* 5 horizontal pill cards — checkbox + icon + label */}
				<div className='mx-auto mb-10 flex w-full max-w-[1000px] flex-wrap items-stretch justify-center gap-2.5 sm:mb-12 sm:gap-3'>
					{pills.map((label, i) => (
						<div
							key={i}
							className='group/pill relative flex min-w-[160px] flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-2.5 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-white/[0.04] sm:min-w-[170px] sm:gap-3 sm:px-4 sm:py-3'
							style={{
								animation: `vhero-float-up 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
							}}
						>
							{/* Custom checkbox — filled emerald square with check */}
							<span className='flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-emerald-400/40 bg-emerald-400/15 transition-colors group-hover/pill:border-emerald-400/70 group-hover/pill:bg-emerald-400/25'>
								<svg
									viewBox='0 0 12 12'
									fill='none'
									stroke='currentColor'
									strokeWidth='2'
									className='h-2.5 w-2.5 text-emerald-300'
								>
									<path
										d='M2.5 6.5l2.5 2.5L9.5 3.5'
										strokeLinecap='round'
										strokeLinejoin='round'
									/>
								</svg>
							</span>
							{/* Icon */}
							<span className='flex h-5 w-5 shrink-0 items-center justify-center text-emerald-300/80 transition-colors group-hover/pill:text-emerald-300'>
								{PILL_ICONS[i]?.()}
							</span>
							{/* Label */}
							<span className='whitespace-nowrap text-[12px] font-medium text-zinc-200 sm:text-[13px]'>
								{label}
							</span>
						</div>
					))}
				</div>

				{/* CTAs — larger than typical buttons because they are the
				    primary conversion action on the entire homepage. */}
				<div className='mb-4 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4'>
					<Link
						href={primaryCtaHref}
						className='rounded-[1.1rem] bg-white px-9 py-5 text-center text-[15px] font-semibold text-black shadow-[0_22px_60px_-18px_rgba(255,255,255,0.65),0_10px_40px_-10px_rgba(16,185,129,0.5)] transition-all hover:bg-emerald-50 hover:shadow-[0_28px_72px_-18px_rgba(255,255,255,0.75),0_14px_44px_-10px_rgba(16,185,129,0.65)] focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-base'
					>
						{primaryCtaLabel ?? t("cta_primary")}
					</Link>
					<Link
						href='#product-tour'
						className='inline-flex items-center justify-center gap-2.5 rounded-[1.1rem] border border-white/15 bg-white/[0.02] px-9 py-5 text-center text-[15px] font-semibold text-white backdrop-blur transition-all hover:border-white/30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30 sm:text-base'
					>
						<svg viewBox='0 0 16 16' fill='none' className='h-4 w-4'>
							<circle
								cx='8'
								cy='8'
								r='7'
								stroke='currentColor'
								strokeWidth='1.4'
							/>
							<path d='M6.5 5.5L11 8l-4.5 2.5v-5z' fill='currentColor' />
						</svg>
						{t("cta_secondary")}
					</Link>
				</div>

				<p className='mx-auto mb-14 mt-2 max-w-[560px] text-[11px] text-zinc-500 sm:mb-16 sm:text-xs'>
					{t("cta_micro")}
				</p>
			</div>

			{/* ─────────── Browser shell ─────────── */}
			<div className='relative mx-auto w-full px-4 sm:px-6 lg:px-8'>
				<BrowserShell
					url={t("shell.url")}
					tabActive={t("shell.tab_active")}
					tabFindings={t("shell.tab_findings")}
					tabSurfaces={t("shell.tab_surfaces")}
					queueEyebrow={t("shell.queue_eyebrow")}
					queueCount={t("shell.queue_count")}
					actions={actions}
					assistantEyebrow={t("shell.assistant_eyebrow")}
					assistantMessage={t("shell.assistant_message")}
					assistantChipEvidence={t("shell.assistant_chip_evidence")}
					assistantChipAction={t("shell.assistant_chip_action")}
					calloutEyebrow={t("shell.callout_eyebrow")}
					calloutValue={t("shell.callout_value")}
					calloutUnit={t("shell.callout_unit")}
					calloutSub={t("shell.callout_sub")}
				/>
			</div>
		</section>
	);
};

export default Hero;
