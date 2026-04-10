"use client";

/**
 * HeroPills — 5 interactive impact/solution cards in the hero.
 *
 * Each card has two layers of text (impact at idle, solution when
 * selected) that crossfade with a liquid-fill emerald animation.
 *
 * CARD LAYOUT (both mobile and desktop):
 *   ┌──────────────────────┐
 *   │  🔍            ☑     │  ← row 1: icon (left) + checkbox (right)
 *   │  Frase em uma linha  │  ← row 2: single-line text, small font
 *   └──────────────────────┘
 *
 * Text is small (12-13px), regular weight (not bold), limited to
 * one line via `truncate`. The icon is 18x18 and the checkbox is
 * 16x16. Card height adapts to content (~72px on desktop, ~60px
 * on mobile).
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
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-[18px] w-[18px]'>
			<path d='M2 4h16l-6 7v6l-4-2v-4L2 4z' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-[18px] w-[18px]'>
			<rect x='2' y='5' width='16' height='10' rx='1.5' />
			<circle cx='10' cy='10' r='2.2' />
			<path d='M14 9l2 2M16 9l-2 2' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-[18px] w-[18px]'>
			<path d='M10 17s-6-3.5-6-8a3.5 3.5 0 016-2.5A3.5 3.5 0 0116 9c0 4.5-6 8-6 8z' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-[18px] w-[18px]'>
			<circle cx='10' cy='10' r='7' />
			<path d='M8 7.5a2 2 0 014 0c0 1.2-1.5 1.5-2 2.5v0.5' />
			<circle cx='10' cy='13.5' r='0.5' fill='currentColor' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-[18px] w-[18px]'>
			<path d='M10 3l8 14H2L10 3z' />
			<path d='M10 8v4' />
			<circle cx='10' cy='14.5' r='0.5' fill='currentColor' />
		</svg>
	),
];

export default function HeroPills({ pills }: HeroPillsProps) {
	const [selected, setSelected] = useState<Set<number>>(new Set());

	const toggle = (i: number) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i);
			else next.add(i);
			return next;
		});
	};

	return (
		<div className='mx-auto mb-8 grid w-full max-w-[1100px] grid-cols-2 gap-2 text-left sm:mb-10 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-5'>
			{pills.map((pill, i) => {
				const isOn = selected.has(i);

				return (
					<button
						key={i}
						type='button'
						onClick={() => toggle(i)}
						aria-pressed={isOn}
						className={[
							"vhero-pill group/pill",
							"relative isolate w-full overflow-hidden rounded-xl",
							"border transition-all duration-500 ease-out",
							"px-3 py-2.5 sm:px-3.5 sm:py-3",
							"hover:-translate-y-0.5",
							isOn
								? "border-emerald-400/60 shadow-[0_10px_28px_-12px_rgba(16,185,129,0.5)]"
								: "border-white/10 bg-white/[0.025] hover:border-emerald-400/30 hover:bg-white/[0.04]",
						].join(" ")}
						style={{
							animation: `vhero-float-up 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
						}}
					>
						{/* Liquid fill layer */}
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

						{/* IDLE FACE */}
						<div
							className={[
								"absolute inset-0 z-10 flex flex-col justify-between px-3 py-2.5 sm:px-3.5 sm:py-3",
								"transition-opacity duration-500",
								isOn ? "opacity-0" : "opacity-100",
							].join(" ")}
						>
							{/* Row 1: icon + checkbox */}
							<div className='flex items-center justify-between'>
								<span className='flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300'>
									{PILL_ICONS[i]?.()}
								</span>
								<span className='flex h-4 w-4 items-center justify-center rounded-[3px] border border-white/25 bg-white/[0.02]'>
									{/* Empty checkbox */}
								</span>
							</div>
							{/* Row 2: impact text */}
							<div className='mt-2 truncate text-[12px] leading-tight text-zinc-300 sm:text-[13px]'>
								{pill.impact}
							</div>
						</div>

						{/* SELECTED FACE */}
						<div
							className={[
								"absolute inset-0 z-10 flex flex-col justify-between px-3 py-2.5 sm:px-3.5 sm:py-3",
								"transition-opacity duration-500",
								isOn ? "opacity-100 delay-200" : "opacity-0",
							].join(" ")}
						>
							{/* Row 1: icon + filled checkbox */}
							<div className='flex items-center justify-between'>
								<span className='flex h-6 w-6 items-center justify-center rounded-md bg-[#0a1a14]/15 text-[#0a1a14]'>
									{PILL_ICONS[i]?.()}
								</span>
								<span className='flex h-4 w-4 items-center justify-center rounded-[3px] border border-[#0a1a14]/30 bg-[#0a1a14]'>
									<svg viewBox='0 0 12 12' fill='none' stroke='currentColor' strokeWidth='2.2' className='h-2.5 w-2.5 text-emerald-300'>
										<path d='M2.5 6.5l2.5 2.5L9.5 3.5' strokeLinecap='round' strokeLinejoin='round' />
									</svg>
								</span>
							</div>
							{/* Row 2: solution text */}
							<div className='mt-2 truncate text-[12px] leading-tight text-[#0a1a14] sm:text-[13px]'>
								{pill.solution}
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
