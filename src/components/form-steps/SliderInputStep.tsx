"use client";

/**
 * SliderInputStep — a single range slider question.
 *
 * Layout matches TextInputStep: title at top, slider + button at bottom.
 * Slider styled for the white shiny-card (dark thumb, light track).
 */

import { useState, useCallback } from "react";

interface SliderInputStepProps {
	title: string;
	subtitle?: string;
	min: number;
	max: number;
	step: number;
	defaultValue: number;
	/** Format the value for display (e.g. "R$50k") */
	formatValue: (value: number) => string;
	/** Label shown at the min end */
	minLabel?: string;
	/** Label shown at the max end */
	maxLabel?: string;
	buttonLabel: string;
	onSubmit: (value: number) => void;
	loading?: boolean;
}

export default function SliderInputStep({
	title,
	subtitle,
	min,
	max,
	step,
	defaultValue,
	formatValue,
	minLabel,
	maxLabel,
	buttonLabel,
	onSubmit,
	loading = false,
}: SliderInputStepProps) {
	const [value, setValue] = useState(defaultValue);

	const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setValue(Number(e.target.value));
	}, []);

	const progress = ((value - min) / (max - min)) * 100;

	return (
		<div className="flex flex-1 flex-col">
			{/* Top: title + subtitle */}
			<div>
				<h2 className="text-[1.625rem] font-bold leading-[1.15] tracking-tight text-content sm:text-3xl">
					{title}
				</h2>
				{subtitle && (
					<p className="mt-2 text-[15px] leading-relaxed text-content-muted sm:text-base">
						{subtitle}
					</p>
				)}
			</div>

			{/* Stretch space */}
			<div className="flex-1 min-h-[40px]" />

			{/* Bottom: value display + slider + button */}
			<div>
				{/* Current value — large, centered */}
				<div className="mb-6 text-center">
					<span className="text-3xl font-bold tabular-nums tracking-tight text-content sm:text-4xl">
						{formatValue(value)}
					</span>
				</div>

				{/* Slider */}
				<div className="mb-2">
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={value}
						onChange={handleChange}
						className="step-slider w-full"
						style={{
							background: `linear-gradient(to right, rgb(var(--text-primary)) ${progress}%, rgb(var(--bg-inset)) ${progress}%)`,
						}}
					/>
				</div>

				{/* Min/max labels */}
				{(minLabel || maxLabel) && (
					<div className="mb-6 flex justify-between text-[11px] text-content-faint">
						<span>{minLabel}</span>
						<span>{maxLabel}</span>
					</div>
				)}

				{/* Submit button */}
				<button
					type="button"
					onClick={() => onSubmit(value)}
					disabled={loading}
					className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-all ${
						loading
							? "cursor-not-allowed bg-surface-inset text-content-faint"
							: "bg-emerald-100 text-zinc-900 hover:bg-emerald-200 active:scale-[0.99] dark:bg-emerald-500/20 dark:text-content dark:hover:bg-emerald-500/30"
					}`}
				>
					{buttonLabel}
					{!loading && (
						<svg
							className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M3 8h10M9 4l4 4-4 4" />
						</svg>
					)}
				</button>
			</div>

			{/* Slider styles — adapted from ROI Calculator for white card bg */}
			<style>{`
				.step-slider {
					-webkit-appearance: none;
					appearance: none;
					height: 10px;
					border-radius: 5px;
					outline: none;
					cursor: pointer;
					padding: 8px 0;
					box-sizing: content-box;
					background-clip: content-box;
				}
				.step-slider::-webkit-slider-thumb {
					-webkit-appearance: none;
					appearance: none;
					width: 32px;
					height: 32px;
					border-radius: 50%;
					background: rgb(var(--text-primary));
					border: 3px solid rgb(var(--bg-card));
					box-shadow: 0 2px 6px rgba(0,0,0,0.25);
					cursor: pointer;
					transition: box-shadow 0.15s;
					margin-top: -11px;
				}
				.step-slider::-webkit-slider-thumb:hover {
					box-shadow: 0 2px 10px rgba(0,0,0,0.35);
				}
				.step-slider::-moz-range-thumb {
					width: 32px;
					height: 32px;
					border-radius: 50%;
					background: rgb(var(--text-primary));
					border: 3px solid rgb(var(--bg-card));
					box-shadow: 0 2px 6px rgba(0,0,0,0.25);
					cursor: pointer;
				}
				.step-slider::-webkit-slider-runnable-track {
					height: 10px;
					border-radius: 5px;
				}
				.step-slider::-moz-range-track {
					height: 10px;
					border-radius: 5px;
					background: rgb(var(--bg-inset));
				}
			`}</style>
		</div>
	);
}
