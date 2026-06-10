"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ValuePreview as ValuePreviewType, ValuePreviewMarker } from "../types";

/*
 * Value Preview — "O que você ganha continuando"
 *
 * Horizontal timeline with 4 markers (now, M3, M6, M12). Each marker
 * is a clickable/hoverable dot that reveals an unlocks list via
 * Radix Tooltip. The current marker is filled; future are outlined.
 * Below the timeline: short narrative paragraph personalized to the
 * env's stage on the curve.
 *
 * Strategic role: this is the cumulative-value visibility section —
 * the operator should leave the plan with "I see why month 4 of
 * Vestigio is worth more than month 1." It's load-bearing for the
 * retention thesis (see PLAN_MONTHLY_STRATEGY.md §-3).
 */

interface Props {
	preview: ValuePreviewType;
	narrative: string;
}

function renderInline(text: string): ReactNode[] {
	const parts: ReactNode[] = [];
	const matches = Array.from(text.matchAll(/(\*\*[^*]+\*\*)/g));
	let lastIndex = 0;
	let key = 0;
	for (const m of matches) {
		const idx = m.index ?? 0;
		if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
		parts.push(
			<strong key={key++} className="font-semibold text-content">
				{m[0].slice(2, -2)}
			</strong>,
		);
		lastIndex = idx + m[0].length;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

function Marker({
	marker,
	position,
	delay,
}: {
	marker: ValuePreviewMarker;
	position: number;
	delay: number;
}) {
	const isCurrent = marker.icon === "check";
	const isPending = marker.icon === "pending";

	return (
		<Tooltip.Provider delayDuration={150}>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<motion.button
						type="button"
						initial={{ opacity: 0, scale: 0.6 }}
						whileInView={{ opacity: 1, scale: 1 }}
						viewport={{ once: true }}
						transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
						// User-agent button padding + border was offsetting
						// the dot off the horizontal line. Reset to a bare
						// flex container the size of the dot so -translate-y-1/2
						// centers exactly on the line.
						className="group/marker absolute flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
						style={{ left: `${position}%`, top: "50%" }}
					>
						<div
							className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-all ${
								isCurrent
									? "border-2 border-content bg-content"
									: isPending
										? "border-2 border-content bg-surface"
										: "border-2 border-edge bg-surface"
							} group-hover/marker:scale-125`}
						>
							{isCurrent && (
								<svg width="7" height="7" viewBox="0 0 7 7" fill="none">
									<path
										d="M1 3.5L2.8 5.3L6 1.7"
										stroke="rgb(var(--bg-page))"
										strokeWidth="1.6"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</div>
						{/* Labels sit below the dot. The button was shrunk to
						    the dot's footprint so positioning context is tight —
						    anchor with `top-full` (just below button bottom) plus
						    a small margin instead of relying on the static-flow
						    fallback, which collapses everything onto the dot. */}
						<div
							className={`absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] ${
								isCurrent ? "text-content" : "text-content-muted"
							}`}
						>
							{marker.label}
						</div>
						{marker.eta && !isCurrent && (
							<div className="absolute left-1/2 top-full mt-6 max-w-[90px] -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10px] leading-tight tabular-nums text-content-faint">
								{marker.eta}
							</div>
						)}
					</motion.button>
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content
						sideOffset={28}
						side="top"
						className="z-50 max-w-[260px] rounded-lg border border-edge bg-surface-tooltip p-3 shadow-dropdown"
					>
						<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							{marker.label}
						</div>
						<ul className="space-y-1 text-[12px] leading-snug text-content-secondary">
							{marker.unlocked.map((u, i) => (
								<li key={i} className="flex gap-1.5">
									<span className="text-content-faint">·</span>
									<span>{u}</span>
								</li>
							))}
						</ul>
						<Tooltip.Arrow className="fill-edge" />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</Tooltip.Provider>
	);
}

export default function ValuePreview({ preview, narrative }: Props) {
	const paragraphs = narrative.split(/\n{2,}/).filter((p) => p.trim().length > 0);

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.32 }}
			className="mb-12"
		>
			<div className="mb-6 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que o próximo mês destrava
				</h2>
				<div className="text-[11px] text-content-faint">
					Projeção acumulada · 1º ao 12º mês
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-8">
				{/* Timeline */}
				<div className="relative mx-auto mb-16 h-20 max-w-[680px]">
					<div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-edge" />
					<motion.div
						initial={{ scaleX: 0 }}
						whileInView={{ scaleX: 0.08 }}
						viewport={{ once: true }}
						transition={{ delay: 0.5, duration: 0.8 }}
						className="absolute left-0 top-1/2 h-px origin-left -translate-y-1/2 bg-content"
					/>
					{/* Marker positions pulled inboard from 0/100% so the
					    centered (-translate-x-1/2) labels — particularly
					    "M12" + ETA caption — don't overflow the timeline
					    container on narrow mobile viewports (<360px). */}
					<Marker marker={preview.currentMonth} position={8} delay={0.3} />
					<Marker marker={preview.milestoneM3} position={36} delay={0.4} />
					<Marker marker={preview.milestoneM6} position={64} delay={0.5} />
					<Marker marker={preview.milestoneM12} position={92} delay={0.6} />
				</div>

				{/* Narrative */}
				<div className="mx-auto max-w-[640px]">
					<div className="font-serif text-[15px] leading-[1.7] text-content-secondary">
						{paragraphs.map((para, i) => (
							<p key={i} className={i > 0 ? "mt-3" : ""}>
								{renderInline(para)}
							</p>
						))}
					</div>
				</div>
			</div>
		</motion.section>
	);
}
