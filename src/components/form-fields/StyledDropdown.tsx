"use client";

import { useState, useRef, useEffect } from "react";

// ──────────────────────────────────────────────
// Styled Dropdown
//
// Custom-styled select replacement used by both /onboard and /lp/audit.
// Avoids the platform <select> entirely (matches the "use our styled
// dropdown, not system" rule).
//
// Visual style is consistent with the dark zinc theme used in the
// onboard form. Each option can carry an optional description that
// renders below the label inside the dropdown panel (used by the
// business-type field, where context matters at selection time).
// ──────────────────────────────────────────────

export interface StyledDropdownOption<T extends string> {
	value: T;
	label: string;
	description?: string;
}

interface StyledDropdownProps<T extends string> {
	value: T;
	options: StyledDropdownOption<T>[];
	onChange: (value: T) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
	hasError?: boolean;
}

export function StyledDropdown<T extends string>({
	value,
	options,
	onChange,
	placeholder = "Select...",
	disabled = false,
	id,
	hasError = false,
}: StyledDropdownProps<T>) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		if (open) document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	const selected = options.find((o) => o.value === value);
	const borderClass = hasError
		? "border-red-600 focus:border-red-600 focus:ring-red-600"
		: open
			? "border-emerald-600 ring-1 ring-emerald-600"
			: "border-zinc-700 hover:border-zinc-600";

	return (
		<div className="relative" ref={ref}>
			<button
				id={id}
				type="button"
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				className={`flex w-full items-center justify-between rounded-md border bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${borderClass}`}
			>
				<span className={selected ? "" : "text-zinc-500"}>
					{selected?.label ?? placeholder}
				</span>
				<svg
					className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			{open && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
					{options.map((opt) => {
						const isSelected = opt.value === value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() => {
									onChange(opt.value);
									setOpen(false);
								}}
								className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800 ${
									isSelected ? "bg-zinc-800/60" : ""
								}`}
							>
								<svg
									className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-emerald-400" : "text-transparent"}`}
									fill="none"
									viewBox="0 0 24 24"
									strokeWidth={2.5}
									stroke="currentColor"
								>
									<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
								</svg>
								<div className="min-w-0 flex-1">
									<div className={`text-sm font-medium ${isSelected ? "text-zinc-100" : "text-zinc-200"}`}>
										{opt.label}
									</div>
									{opt.description && (
										<div className="mt-0.5 text-xs text-zinc-500">{opt.description}</div>
									)}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
