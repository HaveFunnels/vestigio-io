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
				<h2 className="text-[1.625rem] font-bold leading-[1.15] tracking-tight text-zinc-900 sm:text-3xl">
					{title}
				</h2>
				{subtitle && (
					<p className="mt-2 text-[15px] leading-relaxed text-zinc-500 sm:text-base">
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
					<span className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 sm:text-4xl">
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
							background: `linear-gradient(to right, #18181b ${progress}%, #e4e4e7 ${progress}%)`,
						}}
					/>
				</div>

				{/* Min/max labels */}
				{(minLabel || maxLabel) && (
					<div className="mb-6 flex justify-between text-[11px] text-zinc-400">
						<span>{minLabel}</span>
						<span>{maxLabel}</span>
					</div>
				)}

				{/* Submit button */}
				<button
					type="button"
					onClick={() => onSubmit(value)}
					disabled={loading}
					className={`w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
						loading
							? "cursor-not-allowed bg-zinc-200 text-zinc-400"
							: "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]"
					}`}
				>
					{buttonLabel}
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
					background: #18181b;
					border: 3px solid #ffffff;
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
					background: #18181b;
					border: 3px solid #ffffff;
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
					background: #e4e4e7;
				}
			`}</style>
		</div>
	);
}
