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
					// The shared .shiny-input class defaults to a dark
					// (#12121e) fill. The funnel can be light or dark
					// depending on theme; use surface-card via CSS var
					// override so the typed value stays readable both ways.
					className={`shiny-input w-full rounded-xl bg-surface-card px-4 py-3.5 text-sm text-content placeholder:text-content-faint outline-none ${
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
					<p className="mt-2 text-xs text-content-faint">{hint}</p>
				)}

				{children && <div className="mt-4">{children}</div>}

				<button
					type="button"
					onClick={onSubmit}
					disabled={!canSubmit}
					className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-all ${
						canSubmit
							? "bg-emerald-100 text-zinc-900 hover:bg-emerald-200 active:scale-[0.99] dark:bg-emerald-500/20 dark:text-content dark:hover:bg-emerald-500/30"
							: "cursor-not-allowed bg-surface-inset text-content-faint"
					}`}
				>
					{loading ? (
						<span className="flex items-center justify-center gap-2">
							<span className="inline-flex items-center gap-1">
								<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
								<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
								<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
							</span>
							{buttonLabel}
						</span>
					) : (
						<>
							{buttonLabel}
							<svg
								className={`h-4 w-4 transition-transform ${canSubmit ? "text-emerald-600 dark:text-emerald-400" : "text-content-faint"}`}
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
						</>
					)}
				</button>
			</div>
		</div>
	);
}
