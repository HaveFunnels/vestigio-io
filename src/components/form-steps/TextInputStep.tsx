"use client";

/**
 * TextInputStep — a single text input question on a light card.
 *
 * Shows: bold title, optional subtitle, one input, optional extra
 * content (e.g. ownership checkbox), and a "Continue" button.
 * Enter key submits when the input is valid.
 */

import { useRef, useEffect } from "react";

interface TextInputStepProps {
	title: string;
	subtitle?: string;
	/** Input props */
	inputType?: "text" | "url" | "email" | "tel";
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	error?: string | null;
	warning?: React.ReactNode;
	hint?: string;
	/** Extra content rendered below the input (e.g. ownership checkbox) */
	children?: React.ReactNode;
	/** Submit button */
	buttonLabel: string;
	onSubmit: () => void;
	disabled?: boolean;
	loading?: boolean;
	/** Auto-focus the input on mount */
	autoFocus?: boolean;
}

export default function TextInputStep({
	title,
	subtitle,
	inputType = "text",
	value,
	onChange,
	placeholder,
	error,
	warning,
	hint,
	children,
	buttonLabel,
	onSubmit,
	disabled = false,
	loading = false,
	autoFocus = true,
}: TextInputStepProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const canSubmit = !disabled && !loading && value.length > 0;

	useEffect(() => {
		if (autoFocus) {
			// Small delay so AnimatePresence finishes the enter animation
			const t = setTimeout(() => inputRef.current?.focus(), 320);
			return () => clearTimeout(t);
		}
	}, [autoFocus]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && canSubmit) {
			e.preventDefault();
			onSubmit();
		}
	};

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
			{!subtitle && <div className="mb-6" />}

			{/* Input */}
			<div className="mb-2">
				<input
					ref={inputRef}
					type={inputType}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					autoComplete={inputType === "email" ? "email" : inputType === "url" ? "url" : "off"}
					className={`shiny-input w-full rounded-xl px-4 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ${
						error
							? "!border-red-400 !bg-red-50"
							: ""
					}`}
				/>
			</div>

			{/* Error */}
			{error && (
				<p className="mb-2 text-xs text-red-600">{error}</p>
			)}

			{/* Warning */}
			{warning && !error && (
				<div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
					{warning}
				</div>
			)}

			{/* Hint */}
			{hint && !error && !warning && (
				<p className="mb-2 text-xs text-zinc-400">{hint}</p>
			)}

			{/* Extra content (e.g. ownership checkbox) */}
			{children && <div className="mt-3">{children}</div>}

			{/* Submit button */}
			<button
				type="button"
				onClick={onSubmit}
				disabled={!canSubmit}
				className={`mt-8 w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
					canSubmit
						? "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]"
						: "cursor-not-allowed bg-zinc-200 text-zinc-400"
				}`}
			>
				{loading ? (
					<span className="flex items-center justify-center gap-2">
						<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
						</svg>
						{buttonLabel}
					</span>
				) : (
					buttonLabel
				)}
			</button>
		</div>
	);
}
