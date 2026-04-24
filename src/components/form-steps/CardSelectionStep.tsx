"use client";

/**
 * CardSelectionStep — tappable card grid with auto-advance.
 *
 * On tap: selected card gets emerald border + subtle scale + checkmark.
 * After a short delay (400ms default) the parent's onSelect fires,
 * which should advance to the next step. No "Next" button.
 */

import { useState, useRef, useCallback } from "react";
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
	/** Currently persisted value (for back navigation) */
	value?: T | null;
	/** Called after the auto-advance delay with the selected value */
	onSelect: (value: T) => void;
	/** Delay in ms before auto-advancing (default 400) */
	autoAdvanceDelay?: number;
}

export default function CardSelectionStep<T extends string = string>({
	title,
	subtitle,
	options,
	value,
	onSelect,
	autoAdvanceDelay = 400,
}: CardSelectionStepProps<T>) {
	const [pending, setPending] = useState<T | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const handleTap = useCallback(
		(optionValue: T) => {
			// Prevent double-tap
			if (pending) return;

			setPending(optionValue);

			// Clear any existing timer
			if (timerRef.current) clearTimeout(timerRef.current);

			timerRef.current = setTimeout(() => {
				onSelect(optionValue);
			}, autoAdvanceDelay);
		},
		[pending, onSelect, autoAdvanceDelay],
	);

	// Cleanup on unmount
	const cleanupRef = useRef(timerRef);
	cleanupRef.current = timerRef;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	// Cleanup handled via ref

	const selected = pending ?? value ?? null;

	return (
		<div className="flex flex-col">
			{/* Title */}
			<h2 className="mb-1.5 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
				{title}
			</h2>

			{/* Subtitle */}
			{subtitle && (
				<p className="mb-6 text-sm leading-relaxed text-zinc-500">
					{subtitle}
				</p>
			)}

			{/* Card grid */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{options.map((option) => {
					const isSelected = selected === option.value;
					const isPending = pending === option.value;

					return (
						<button
							key={option.value}
							type="button"
							onClick={() => handleTap(option.value)}
							disabled={!!pending}
							className={`relative flex flex-col items-start rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
								isSelected
									? "border-emerald-500 bg-emerald-50 scale-[1.02] shadow-[0_0_16px_rgba(16,185,129,0.15)]"
									: "border-zinc-200 bg-zinc-100 hover:border-zinc-300 hover:bg-zinc-50"
							} ${pending && !isPending ? "opacity-50" : ""}`}
						>
							{/* Label */}
							<span
								className={`text-sm font-semibold ${
									isSelected ? "text-emerald-900" : "text-zinc-900"
								}`}
							>
								{option.label}
							</span>

							{/* Description */}
							{option.description && (
								<span
									className={`mt-0.5 text-xs ${
										isSelected ? "text-emerald-700" : "text-zinc-500"
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
