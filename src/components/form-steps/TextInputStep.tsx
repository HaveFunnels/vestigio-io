"use client";

/**
 * TextInputStep — single text input on a full-height card.
 *
 * Layout:
 *   Title + subtitle pinned to top
 *   (stretch space)
 *   Input + optional children (checkbox) + button pinned to bottom
 */

import { useRef, useEffect } from "react";

interface TextInputStepProps {
	title: string;
	subtitle?: string;
	inputType?: "text" | "url" | "email" | "tel";
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	error?: string | null;
	warning?: React.ReactNode;
	hint?: string;
	children?: React.ReactNode;
	buttonLabel: string;
	onSubmit: () => void;
	disabled?: boolean;
	loading?: boolean;
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

			{/* Bottom: input + extras + button */}
			<div>
				<input
					ref={inputRef}
					type={inputType}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					autoComplete={inputType === "email" ? "email" : inputType === "url" ? "url" : "off"}
					className={`shiny-input w-full rounded-xl px-4 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ${
						error ? "!border-red-400 !bg-red-50" : ""
					}`}
				/>

				{error && (
					<p className="mt-2 text-xs text-red-600">{error}</p>
				)}

				{warning && !error && (
					<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
						{warning}
					</div>
				)}

				{hint && !error && !warning && (
					<p className="mt-2 text-xs text-zinc-400">{hint}</p>
				)}

				{children && <div className="mt-4">{children}</div>}

				<button
					type="button"
					onClick={onSubmit}
					disabled={!canSubmit}
					className={`mt-6 w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
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
		</div>
	);
}
