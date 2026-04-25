"use client";

/**
 * CardSelectionStep — tappable card grid with auto-advance.
 *
 * On tap: selected card gets black border + subtle scale + checkmark.
 * After a short delay (400ms default) the parent's onSelect fires,
 * which should advance to the next step. No "Next" button.
 *
 * Cards start with no pre-selection — all look identical until tapped.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

export interface CardOption<T extends string = string> {
	value: T;
	label: string;
	description?: string;
}

interface CardSelectionStepProps<T extends string = string> {
	title: string;
	subtitle?: string;
	options: CardOption<T>[];
	/** Called after the auto-advance delay with the selected value */
	onSelect: (value: T) => void;
	/** Delay in ms before auto-advancing (default 400) */
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
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	// Cleanup timer on unmount
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
		<div className="flex flex-col">
			{/* Title */}
			<h2 className="mb-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
				{title}
			</h2>

			{/* Subtitle */}
			{subtitle && (
				<p className="mb-8 text-sm leading-relaxed text-zinc-500">
					{subtitle}
				</p>
			)}

			{/* Card grid — 1 col mobile, 2 col desktop */}
			<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
				{options.map((option) => {
					const isSelected = pending === option.value;

					return (
						<button
							key={option.value}
							type="button"
							onClick={() => handleTap(option.value)}
							disabled={!!pending}
							className={`relative flex flex-col items-start rounded-xl border px-5 py-5 text-left transition-all duration-200 ${
								isSelected
									? "border-zinc-900 bg-zinc-900 scale-[1.02] shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
									: "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100"
							} ${pending && !isSelected ? "opacity-40" : ""}`}
						>
							{/* Label */}
							<span
								className={`text-sm font-semibold ${
									isSelected ? "text-white" : "text-zinc-900"
								}`}
							>
								{option.label}
							</span>

							{/* Description */}
							{option.description && (
								<span
									className={`mt-0.5 text-xs ${
										isSelected ? "text-zinc-400" : "text-zinc-500"
									}`}
								>
									{option.description}
								</span>
							)}

							{/* Checkmark */}
							{isSelected && (
								<motion.div
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									transition={{
										type: "spring",
										stiffness: 300,
										damping: 20,
									}}
									className="absolute right-3 top-3"
								>
									<div className="flex h-5 w-5 items-center justify-center rounded-full bg-white">
										<svg
											viewBox="0 0 12 12"
											fill="none"
											stroke="#18181b"
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
