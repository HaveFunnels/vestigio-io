"use client";

/**
 * CardSelectionStep — tappable card grid with auto-advance.
 *
 * Title + subtitle + cards are vertically centered as a group
 * within the card. Cards are tall with large text.
 */

import { useState, useRef, useCallback, useEffect, type ComponentType } from "react";
import { motion } from "framer-motion";

export interface CardOption<T extends string = string> {
	value: T;
	label: string;
	description?: string;
	/** Optional Phosphor icon component. Renders in a pale-emerald
	 *  circle to the left of the label. Cards without an icon collapse
	 *  back to the previous label-only layout, so existing callers
	 *  keep working. */
	icon?: ComponentType<{ size?: number; weight?: any }>;
}

interface CardSelectionStepProps<T extends string = string> {
	title: string;
	subtitle?: string;
	options: CardOption<T>[];
	onSelect: (value: T) => void;
	autoAdvanceDelay?: number;
}

export default function CardSelectionStep<T extends string = string>({
	title,
	subtitle,
	options,
	onSelect,
	autoAdvanceDelay = 400,
}: CardSelectionStepProps<T>) {
	const [pending, setPending] = useState<T | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const handleTap = useCallback(
		(optionValue: T) => {
			if (pending) return;
			setPending(optionValue);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				onSelect(optionValue);
			}, autoAdvanceDelay);
		},
		[pending, onSelect, autoAdvanceDelay],
	);

	return (
		<div className="flex flex-1 flex-col">
			{/* Title + subtitle pinned to top */}
			<div>
				<h2 className="text-[1.625rem] font-bold leading-[1.15] tracking-tight text-zinc-900 sm:text-3xl">
					{title}
				</h2>
				{subtitle && (
					<p className="mt-2 text-[15px] leading-relaxed text-zinc-500 sm:text-base">
						{subtitle}
					</p>
				)}
			</div>

			{/* Cards stacked vertically — matches the new design
			    language where each card is a full-width row with an
			    icon chip on the left, label + description right. */}
			<div className="mt-6 flex flex-1 flex-col gap-2.5">
				{options.map((option) => {
					const isSelected = pending === option.value;
					const Icon = option.icon;

					return (
						<button
							key={option.value}
							type="button"
							onClick={() => handleTap(option.value)}
							disabled={!!pending}
							className={`group relative flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-200 sm:px-5 sm:py-5 ${
								isSelected
									? "border-emerald-500/60 bg-emerald-50 ring-1 ring-emerald-500/20"
									: "border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
							} ${pending && !isSelected ? "opacity-40" : ""}`}
						>
							{Icon && (
								<div
									className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
										isSelected ? "bg-emerald-200/70" : "bg-emerald-50"
									}`}
								>
									<Icon size={20} weight="duotone" />
								</div>
							)}
							<div className="min-w-0 flex-1">
								<div className="text-[15px] font-semibold leading-tight text-zinc-900 sm:text-base">
									{option.label}
								</div>
								{option.description && (
									<div className="mt-0.5 text-[13px] leading-snug text-zinc-500">
										{option.description}
									</div>
								)}
							</div>
							{isSelected && (
								<motion.div
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									transition={{ type: "spring", stiffness: 300, damping: 20 }}
									className="shrink-0"
								>
									<div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
										<svg
											viewBox="0 0 12 12"
											fill="none"
											stroke="white"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											className="h-3 w-3"
										>
											<path d="M2.5 6L5 8.5L9.5 3.5" />
										</svg>
									</div>
								</motion.div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
