"use client";

/**
 * HeroPills — the 5 interactive impact/solution cards in the hero.
 *
 * Each card has two faces:
 *   - FRONT: the user's pain ("I'm losing money I can't see")
 *   - BACK: the Vestigio feature that resolves that pain
 *           ("Revenue Leak Detection — Vestigio scans every funnel…")
 *
 * Click a card → the checkbox fills, the card gradient-sweeps into
 * emerald, and the text flip-reveals the solution. Clicking again
 * flips it back. The checkbox sits on the RIGHT side of the card
 * (previous version had it on the left next to the icon, which made
 * the label text wrap unevenly on mobile).
 *
 * Entrance: each card uses the existing `vhero-float-up` keyframe
 * with a staggered delay. The keyframe is defined in the Hero section
 * `<style>` block, so HeroPills inherits it without needing its own.
 *
 * The component is `"use client"` because it owns the selection
 * state. It receives pills + labels as props from the Hero (which
 * is an async server component pulling translations).
 */

import { useState } from "react";

export interface Pill {
	impact: string;
	solution_title: string;
	solution_body: string;
}

interface HeroPillsProps {
	pills: Pill[];
	eyebrowImpact: string;
	eyebrowSolution: string;
}

const PILL_ICONS: Array<() => JSX.Element> = [
	// 1. Droplet — revenue leak
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
	// 2. Three bars — priority queue
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
	// 3. Shield check — verified
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
	// 4. Clock — regressions
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
	// 5. Diamond — scale readiness
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

export default function HeroPills({
	pills,
	eyebrowImpact,
	eyebrowSolution,
}: HeroPillsProps) {
	// Set of selected indices. Multiple cards can be selected at once
	// — the user can "check off" each pain they feel and scan the
	// list of corresponding solutions.
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
						className={`group/pill relative min-h-[112px] overflow-hidden rounded-xl border text-left backdrop-blur transition-all duration-500 ease-out hover:-translate-y-0.5 ${
							isOn
								? // SELECTED — emerald bg sweep + elevated shadow
									"border-emerald-400/45 bg-gradient-to-br from-emerald-500/[0.14] via-emerald-500/[0.06] to-white/[0.02] shadow-[0_14px_36px_-14px_rgba(16,185,129,0.45)]"
								: // IDLE
									"border-white/10 bg-white/[0.025] hover:border-emerald-400/25 hover:bg-white/[0.04]"
						}`}
						style={{
							animation: `vhero-float-up 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
						}}
					>
						{/* Top-right checkbox — click target is the whole
						    card but the checkbox is the visual hint. */}
						<span
							aria-hidden
							className={`pointer-events-none absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-[5px] border transition-all duration-300 ${
								isOn
									? "border-emerald-400 bg-emerald-400/90 shadow-[0_0_12px_-2px_rgba(16,185,129,0.7)]"
									: "border-white/25 bg-white/[0.02] group-hover/pill:border-emerald-400/60 group-hover/pill:bg-emerald-400/15"
							}`}
						>
							<svg
								viewBox='0 0 12 12'
								fill='none'
								stroke='currentColor'
								strokeWidth='2.2'
								className={`h-3 w-3 transition-all duration-300 ${
									isOn ? "scale-100 text-[#0a1a14] opacity-100" : "scale-0 opacity-0"
								}`}
							>
								<path
									d='M2.5 6.5l2.5 2.5L9.5 3.5'
									strokeLinecap='round'
									strokeLinejoin='round'
								/>
							</svg>
						</span>

						{/* FRONT FACE — impact. Visible when NOT selected.
						    Fades + translates upward on flip. */}
						<div
							className={`absolute inset-0 flex flex-col justify-between p-4 transition-all duration-500 sm:p-5 ${
								isOn
									? "pointer-events-none -translate-y-2 opacity-0"
									: "translate-y-0 opacity-100"
							}`}
						>
							<span className='flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-300 transition-colors group-hover/pill:bg-red-500/15'>
								{PILL_ICONS[i]?.()}
							</span>
							<div className='pr-6'>
								<div className='mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-red-300/70'>
									{eyebrowImpact}
								</div>
								<div className='text-[13px] font-medium leading-snug text-zinc-100'>
									{pill.impact}
								</div>
							</div>
						</div>

						{/* BACK FACE — solution. Visible when selected. Fades
						    + translates in from below so the transition feels
						    like a "reveal" rather than a hard swap. */}
						<div
							className={`absolute inset-0 flex flex-col justify-between p-4 transition-all duration-500 sm:p-5 ${
								isOn
									? "translate-y-0 opacity-100"
									: "pointer-events-none translate-y-2 opacity-0"
							}`}
						>
							<span className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_-4px_rgba(16,185,129,0.7)]'>
								{PILL_ICONS[i]?.()}
							</span>
							<div className='pr-6'>
								<div className='mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80'>
									{eyebrowSolution}
								</div>
								<div className='mb-1 text-[13px] font-semibold leading-snug text-white'>
									{pill.solution_title}
								</div>
								<div className='text-[11px] leading-snug text-emerald-100/80'>
									{pill.solution_body}
								</div>
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
