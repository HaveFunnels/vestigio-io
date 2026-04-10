"use client";

/**
 * HeroPills — 5 interactive impact/solution cards in the hero.
 *
 * INTERACTION
 *
 * Each card has two states:
 *   - IDLE      → dark card, white text, the user's pain
 *                 ("Traffic but no leads", "Ads without return", …)
 *   - SELECTED  → emerald-filled card with dark text, the Vestigio
 *                 promise that resolves that pain
 *                 ("We find the block", "We show the leak", …)
 *
 * Click toggles. Multiple cards can be selected at once. The
 * transition between idle and selected is a "liquid fill" — a
 * pseudo-element scales from `scaleY(0)` at the bottom up to
 * `scaleY(1)`, gated on the `[data-on=true]` attribute, so the
 * emerald background fills the card from the bottom up like water
 * filling a glass. Both layers of text crossfade in lockstep with
 * the fill.
 *
 * COPY
 *
 * Pulled from `homepage.hero_v2.pills[i].{impact,solution}` via
 * the dictionary. Each side is constrained to 3-4 words by
 * convention so nothing wraps to a third line.
 *
 * STYLE
 *
 * No eyebrows above the text — the checkbox + the impact-vs-solution
 * color contrast is enough to communicate the state. The card
 * height is fixed (`h-[120px]`) and the inner content uses
 * `flex flex-col justify-center` so the text is always vertically
 * centered, never floating to the bottom.
 *
 * Layout: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`
 * — at xl all 5 pills sit in a single row, at lg they reflow to
 * 3+2, at sm to 2+2+1, at mobile they stack.
 */

import { useState } from "react";

export interface Pill {
	impact: string;
	solution: string;
}

interface HeroPillsProps {
	pills: Pill[];
}

const PILL_ICONS: Array<() => JSX.Element> = [
	// 1. Funnel — traffic going in but nothing coming out
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M2 4h16l-6 7v6l-4-2v-4L2 4z' />
		</svg>
	),
	// 2. Banknote with X — ads without return
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<rect x='2' y='5' width='16' height='10' rx='1.5' />
			<circle cx='10' cy='10' r='2.2' />
			<path d='M14 9l2 2M16 9l-2 2' />
		</svg>
	),
	// 3. Heart — beautiful site, low conversion
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M10 17s-6-3.5-6-8a3.5 3.5 0 016-2.5A3.5 3.5 0 0116 9c0 4.5-6 8-6 8z' />
		</svg>
	),
	// 4. Question mark — don't know what to fix
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<circle cx='10' cy='10' r='7' />
			<path d='M8 7.5a2 2 0 014 0c0 1.2-1.5 1.5-2 2.5v0.5' />
			<circle cx='10' cy='13.5' r='0.5' fill='currentColor' />
		</svg>
	),
	// 5. Warning triangle — breaks after deploy
	() => (
		<svg
			viewBox='0 0 20 20'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M10 3l8 14H2L10 3z' />
			<path d='M10 8v4' />
			<circle cx='10' cy='14.5' r='0.5' fill='currentColor' />
		</svg>
	),
];

export default function HeroPills({ pills }: HeroPillsProps) {
	// Set of selected indices. Multiple cards can be selected at once.
	const [selected, setSelected] = useState<Set<number>>(new Set());

	const toggle = (i: number) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(i)) {
				next.delete(i);
			} else {
				next.add(i);
			}
			return next;
		});
	};

	return (
		<div className='mx-auto mb-10 grid w-full max-w-[1100px] grid-cols-1 gap-3 text-left sm:mb-12 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-5'>
			{pills.map((pill, i) => {
				const isOn = selected.has(i);

				return (
					<button
						key={i}
						type='button'
						onClick={() => toggle(i)}
						aria-pressed={isOn}
						data-on={isOn || undefined}
						className={[
							"vhero-pill group/pill",
							"relative isolate h-[120px] w-full overflow-hidden rounded-2xl",
							"border transition-all duration-500 ease-out",
							"hover:-translate-y-0.5",
							// Idle border vs selected border. The bg is handled
							// by the liquid-fill ::before below, so we keep the
							// element bg dark and let the fill paint over it.
							isOn
								? "border-emerald-400/60 shadow-[0_18px_44px_-18px_rgba(16,185,129,0.55)]"
								: "border-white/10 bg-white/[0.025] hover:border-emerald-400/30 hover:bg-white/[0.04]",
						].join(" ")}
						style={{
							animation: `vhero-float-up 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
						}}
					>
						{/* Top-right checkbox — visual hint that the card is
						    interactive. Click target is the whole card. */}
						<span
							aria-hidden
							className={[
								"pointer-events-none absolute right-3 top-3 z-20",
								"flex h-5 w-5 items-center justify-center rounded-[5px] border",
								"transition-all duration-300",
								isOn
									? "border-[#0a1a14] bg-[#0a1a14] shadow-[0_0_10px_-1px_rgba(10,26,20,0.5)]"
									: "border-white/30 bg-white/[0.02] group-hover/pill:border-emerald-400/60",
							].join(" ")}
						>
							<svg
								viewBox='0 0 12 12'
								fill='none'
								stroke='currentColor'
								strokeWidth='2.2'
								className={`h-3 w-3 transition-all duration-300 ${
									isOn ? "scale-100 text-emerald-300 opacity-100" : "scale-0 opacity-0"
								}`}
							>
								<path
									d='M2.5 6.5l2.5 2.5L9.5 3.5'
									strokeLinecap='round'
									strokeLinejoin='round'
								/>
							</svg>
						</span>

						{/* Liquid fill layer — emerald wave that animates from
						    the bottom up when selected. `transform-origin:
						    bottom` + `scaleY` is the simplest way to do a
						    bottom-to-top fill that respects the card's
						    rounded corners (since the parent has
						    `overflow-hidden`). */}
						<div
							aria-hidden
							className={[
								"pointer-events-none absolute inset-0 z-0",
								"origin-bottom",
								"bg-gradient-to-t from-emerald-400 via-emerald-300 to-emerald-200",
								"transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]",
								isOn ? "scale-y-100" : "scale-y-0",
							].join(" ")}
						/>

						{/* IDLE FACE — dark surface, white text, the user's
						    pain. Visible when NOT selected. */}
						<div
							className={[
								"absolute inset-0 z-10 flex flex-col items-start justify-center px-5",
								"transition-opacity duration-500",
								isOn ? "opacity-0" : "opacity-100",
							].join(" ")}
						>
							<span className='mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300'>
								{PILL_ICONS[i]?.()}
							</span>
							<div className='pr-7 text-[14px] font-semibold leading-tight text-white sm:text-[15px]'>
								{pill.impact}
							</div>
						</div>

						{/* SELECTED FACE — sits on top of the liquid fill,
						    dark text on emerald background. Same vertical
						    centering rules as idle face so the layout
						    doesn't jump. */}
						<div
							className={[
								"absolute inset-0 z-10 flex flex-col items-start justify-center px-5",
								"transition-opacity duration-500",
								isOn ? "opacity-100 delay-200" : "opacity-0",
							].join(" ")}
						>
							<span className='mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#0a1a14]/15 text-[#0a1a14]'>
								{PILL_ICONS[i]?.()}
							</span>
							<div className='pr-7 text-[14px] font-semibold leading-tight text-[#0a1a14] sm:text-[15px]'>
								{pill.solution}
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
