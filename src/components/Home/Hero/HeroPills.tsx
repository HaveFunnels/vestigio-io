"use client";

/**
 * HeroPills — 4 interactive impact/solution cards in the hero.
 *
 * MOBILE layout:
 *   Icon badge centered on top-left corner border (absolute, overlapping).
 *   Single row: text + checkbox.
 *
 * DESKTOP layout (sm+):
 *   Row 1: icon (left) + checkbox (right)
 *   Row 2: text
 *
 * The IDLE face is in normal document flow (not absolute) so the card
 * auto-sizes to its content. The SELECTED face is absolute-positioned
 * on top and crossfades in when the liquid fill reaches it.
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
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3 sm:h-[18px] sm:w-[18px]'>
			<path d='M2 4h16l-6 7v6l-4-2v-4L2 4z' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3 sm:h-[18px] sm:w-[18px]'>
			<rect x='2' y='5' width='16' height='10' rx='1.5' />
			<circle cx='10' cy='10' r='2.2' />
			<path d='M14 9l2 2M16 9l-2 2' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3 sm:h-[18px] sm:w-[18px]'>
			<path d='M10 17s-6-3.5-6-8a3.5 3.5 0 016-2.5A3.5 3.5 0 0116 9c0 4.5-6 8-6 8z' />
		</svg>
	),
	() => (
		<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3 sm:h-[18px] sm:w-[18px]'>
			<circle cx='10' cy='10' r='7' />
			<path d='M8 7.5a2 2 0 014 0c0 1.2-1.5 1.5-2 2.5v0.5' />
			<circle cx='10' cy='13.5' r='0.5' fill='currentColor' />
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
		<div className='mx-auto mb-8 grid w-full max-w-[900px] grid-cols-2 gap-2 text-left sm:mb-10 sm:gap-2.5 lg:grid-cols-4'>
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
							"relative isolate w-full overflow-visible rounded-xl",
							"border transition-all duration-500 ease-out",
							"hover:-translate-y-0.5",
							isOn
								? "border-emerald-400/60 shadow-[0_10px_28px_-12px_rgba(16,185,129,0.5)]"
								: "border-white/10 bg-white/[0.025] hover:border-emerald-400/30 hover:bg-white/[0.04]",
						].join(" ")}
						style={{
							animation: `vhero-float-up 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
						}}
					>
						{/* Icon badge — on mobile: centered on top-left corner border.
						    On desktop: hidden (icon renders inside the card instead). */}
						<span
							aria-hidden
							className={[
								"absolute -left-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md sm:hidden",
								isOn ? "bg-white text-emerald-700 shadow-sm" : "bg-emerald-500/15 text-emerald-300",
							].join(" ")}
						>
							{PILL_ICONS[i]?.()}
						</span>

						{/* Liquid fill layer */}
						<div
							aria-hidden
							className={[
								"pointer-events-none absolute inset-0 z-0 rounded-xl",
								"origin-bottom",
								"bg-gradient-to-t from-emerald-400 via-emerald-300 to-emerald-200",
								"transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]",
								isOn ? "scale-y-100" : "scale-y-0",
							].join(" ")}
						/>

						{/* IDLE FACE */}
						<div
							className={[
								"relative z-10",
								// Mobile: single row (text + checkbox)
								"flex items-center justify-between px-3 py-2.5",
								// Desktop: two-row layout
								"sm:flex-col sm:items-stretch sm:px-3.5 sm:py-3",
								"transition-opacity duration-500",
								isOn ? "opacity-0" : "opacity-100",
							].join(" ")}
						>
							{/* Desktop icon + checkbox row (hidden on mobile) */}
							<div className='hidden items-center justify-between sm:flex'>
								<span className='flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300'>
									{PILL_ICONS[i]?.()}
								</span>
								<span className='flex h-4 w-4 items-center justify-center rounded-[3px] border border-white/25 bg-white/[0.02]' />
							</div>
							{/* Text */}
							<div className='truncate text-[12px] leading-tight text-zinc-300 sm:mt-2 sm:text-[13px]'>
								{pill.impact}
							</div>
							{/* Mobile checkbox (hidden on desktop) */}
							<span className='ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-white/25 bg-white/[0.02] sm:hidden' />
						</div>

						{/* SELECTED FACE */}
						<div
							className={[
								"absolute inset-0 z-10",
								"flex items-center justify-between px-3 py-2.5",
								"sm:flex-col sm:items-stretch sm:px-3.5 sm:py-3",
								"transition-opacity duration-500",
								isOn ? "opacity-100 delay-200" : "pointer-events-none opacity-0",
							].join(" ")}
						>
							{/* Desktop icon + checkbox row (hidden on mobile) */}
							<div className='hidden items-center justify-between sm:flex'>
								<span className='flex h-6 w-6 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm'>
									{PILL_ICONS[i]?.()}
								</span>
								<span className='flex h-4 w-4 items-center justify-center rounded-[3px] border border-[#0a1a14]/30 bg-[#0a1a14]'>
									<svg viewBox='0 0 12 12' fill='none' stroke='currentColor' strokeWidth='2.2' className='h-2.5 w-2.5 text-emerald-300'>
										<path d='M2.5 6.5l2.5 2.5L9.5 3.5' strokeLinecap='round' strokeLinejoin='round' />
									</svg>
								</span>
							</div>
							{/* Text */}
							<div className='truncate text-[12px] leading-tight text-[#0a1a14] sm:mt-2 sm:text-[13px]'>
								{pill.solution}
							</div>
							{/* Mobile checkbox with check (hidden on desktop) */}
							<span className='ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-[#0a1a14]/30 bg-[#0a1a14] sm:hidden'>
								<svg viewBox='0 0 12 12' fill='none' stroke='currentColor' strokeWidth='2.2' className='h-2.5 w-2.5 text-emerald-300'>
									<path d='M2.5 6.5l2.5 2.5L9.5 3.5' strokeLinecap='round' strokeLinejoin='round' />
								</svg>
							</span>
						</div>
					</button>
				);
			})}
		</div>
	);
}
